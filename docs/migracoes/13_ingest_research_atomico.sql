-- 13_ingest_research_atomico.sql
--
-- Torna a gravação de uma pesquisa de candidato atômica.
--
-- O problema que isto resolve, observado em produção em 2026-08-25 com
-- MARCELO CRIVELLA e PEDRO PAULO (ver docs/registros/ingestao-dos-senadores-do-rj.md):
-- ingest-research.ts apagava posições, alertas e fontes e só depois inseria as
-- novas. O cliente Supabase não tem transação, então cada chamada era commitada
-- sozinha. Quando o insert de fontes falhava, as posições já tinham sido
-- apagadas e o candidato ficava com zero temas no ar.
--
-- O gatilho conhecido era o UNIQUE (politician_id, url) de candidate_sources:
-- um alerta resolvido sobrevive ao delete por regra editorial, a fonte que ele
-- cita é preservada junto, e o documento novo, ao redeclarar aquela mesma url,
-- colidia. Mas o gatilho é acessório. Qualquer erro depois do primeiro delete
-- destruía dado, então a correção é a atomicidade, não o desvio da colisão.
--
-- Duas coisas mudam de comportamento aqui, e ambas são deliberadas:
--
--  1. Fonte preservada cuja url volta no documento novo deixa de colidir. A
--     linha antiga é substituída pela nova e os alertas que a citavam passam a
--     apontar para a nova, de mesma url. O alerta preservado nunca fica sem
--     fonte, que é o que a D8 exige.
--  2. Tudo roda dentro de uma função, portanto numa transação só. Um erro em
--     qualquer ponto desfaz a gravação inteira e o candidato continua com o
--     dossiê anterior, íntegro.
--
-- O que NÃO muda: quem sobrevive ao delete de alertas (resolvido, ou aprovado
-- por curador), a versão incremental do dossiê, quais etapas do ledger podem
-- ir para concluido, e o fato de metricas só ser escrita na etapa posicoes.
--
-- As linhas chegam prontas do TypeScript, inclusive o id de cada fonte, que é
-- gerado no cliente para que posições e alertas já possam referenciá-lo.
--
-- Os casts de enum são explícitos porque jsonb ->> devolve text, e o Postgres
-- não converte text para enum sozinho num INSERT. Sem eles a função é criada
-- e só quebra na primeira chamada, quando o corpo é compilado.

CREATE OR REPLACE FUNCTION ingest_research_write(
  p_candidacy_id       uuid,
  p_politician_id      uuid,
  p_sources            jsonb,
  p_positions          jsonb,
  p_alerts             jsonb,
  p_dossier            jsonb,
  p_metricas           jsonb,
  p_eligible_statuses  text[]
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_now             timestamptz := now();
  v_versao          int;
  v_ledger_posicoes int;
  v_ledger_outras   int;
BEGIN
  -- 1. Posições são sempre integralmente reescritas.
  DELETE FROM politician_positions WHERE politician_id = p_politician_id;

  -- 2. Só o que este pipeline gerou e ninguém tocou. Alerta resolvido
  --    (ativo = false) e alerta aprovado por curador (validado_por não nulo)
  --    sobrevivem, pela regra editorial de docs/referencia/alertas.md.
  DELETE FROM politician_alerts
   WHERE politician_id = p_politician_id
     AND gerado_por_ia = true
     AND validado_por IS NULL
     AND ativo = true;

  -- 3. Fonte preservada cuja url reaparece no documento novo: aponte os
  --    alertas sobreviventes para a linha nova antes de remover a antiga.
  --    Sem isto, o ON DELETE SET NULL de politician_alerts.source_id deixaria
  --    um alerta preservado sem fonte, e o insert do passo 5 colidiria no
  --    UNIQUE (politician_id, url).
  UPDATE politician_alerts pa
     SET source_id = novo.id
    FROM (
      SELECT cs.id AS antigo_id, (s->>'id')::uuid AS id
        FROM candidate_sources cs
        JOIN jsonb_array_elements(p_sources) s ON s->>'url' = cs.url
       WHERE cs.politician_id = p_politician_id
    ) novo
   WHERE pa.source_id = novo.antigo_id;

  -- 4. Remove as fontes desta candidatura que o documento novo não preserva,
  --    mais as que ele redeclara (reinseridas logo abaixo, com id novo).
  DELETE FROM candidate_sources cs
   WHERE cs.candidacy_id = p_candidacy_id
     AND (
       cs.id NOT IN (
         SELECT pa.source_id FROM politician_alerts pa
          WHERE pa.politician_id = p_politician_id AND pa.source_id IS NOT NULL
       )
       OR cs.url IN (SELECT s->>'url' FROM jsonb_array_elements(p_sources) s)
     );

  -- 5. Catálogo de fontes do documento novo.
  INSERT INTO candidate_sources (
    id, candidacy_id, politician_id, tipo, camada, titulo, veiculo, url,
    data_publicacao, destino_exibicao
  )
  SELECT (s->>'id')::uuid,
         (s->>'candidacy_id')::uuid,
         (s->>'politician_id')::uuid,
         (s->>'tipo')::source_tipo,
         (s->>'camada')::int,
         s->>'titulo',
         s->>'veiculo',
         s->>'url',
         NULLIF(s->>'data_publicacao', '')::date,
         (s->>'destino_exibicao')::source_destino
    FROM jsonb_array_elements(p_sources) s;

  -- 6. Posições.
  INSERT INTO politician_positions (
    politician_id, theme_id, posicao, neutro_motivo, intensidade, justificativa,
    coerencia_tema, confianca_ia, source_ids, fontes, gerado_por_ia, validado
  )
  SELECT (p->>'politician_id')::uuid,
         (p->>'theme_id')::uuid,
         (p->>'posicao')::position_stance,
         p->>'neutro_motivo',
         (p->>'intensidade')::int,
         p->>'justificativa',
         (p->>'coerencia_tema')::coherence_signal,
         (p->>'confianca_ia')::numeric,
         COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(p->'source_ids') x), '{}'),
         COALESCE(p->'fontes', '[]'::jsonb),
         (p->>'gerado_por_ia')::boolean,
         (p->>'validado')::boolean
    FROM jsonb_array_elements(p_positions) p;

  -- 7. Alertas.
  INSERT INTO politician_alerts (
    politician_id, tipo, severidade, titulo, descricao, data_ocorrencia,
    source_id, fonte_url, fonte_nome, gerado_por_ia, validado, ativo,
    resolucao, data_resolucao
  )
  SELECT (a->>'politician_id')::uuid,
         (a->>'tipo')::alert_type,
         (a->>'severidade')::alert_severity,
         a->>'titulo',
         a->>'descricao',
         NULLIF(a->>'data_ocorrencia', '')::date,
         NULLIF(a->>'source_id', '')::uuid,
         a->>'fonte_url',
         a->>'fonte_nome',
         (a->>'gerado_por_ia')::boolean,
         (a->>'validado')::boolean,
         (a->>'ativo')::boolean,
         a->>'resolucao',
         NULLIF(a->>'data_resolucao', '')::date
    FROM jsonb_array_elements(p_alerts) a;

  -- 8. Dossiê versionado. A versão é calculada aqui dentro, na mesma
  --    transação, para que duas ingestões simultâneas não escolham o mesmo
  --    número e uma delas quebre no UNIQUE (candidacy_id, versao).
  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_versao
    FROM candidate_dossiers WHERE candidacy_id = p_candidacy_id;

  INSERT INTO candidate_dossiers (
    candidacy_id, resumo_perfil, espectro_declarado, espectro_inferido,
    coerencia_indice, coerencia_base, versao
  )
  VALUES (
    p_candidacy_id,
    p_dossier->>'resumo_perfil',
    p_dossier->>'espectro_declarado',
    p_dossier->>'espectro_inferido',
    NULLIF(p_dossier->>'coerencia_indice', '')::int,
    p_dossier->>'coerencia_base',
    v_versao
  );

  -- 9. Ledger. metricas só na etapa posicoes: escrever o mesmo blob nas cinco
  --    etapas multiplicaria por cinco qualquer soma entre etapas.
  UPDATE enrichment_ledger
     SET status = 'concluido', concluido_em = v_now, atualizado_em = v_now,
         metricas = p_metricas
   WHERE candidacy_id = p_candidacy_id
     AND etapa = 'posicoes'
     AND status::text = ANY(p_eligible_statuses);
  GET DIAGNOSTICS v_ledger_posicoes = ROW_COUNT;

  UPDATE enrichment_ledger
     SET status = 'concluido', concluido_em = v_now, atualizado_em = v_now
   WHERE candidacy_id = p_candidacy_id
     AND etapa <> 'posicoes'
     AND status::text = ANY(p_eligible_statuses);
  GET DIAGNOSTICS v_ledger_outras = ROW_COUNT;

  -- I1: um update que não casa nenhuma linha não é erro no PostgREST. Uma
  -- candidatura nunca semeada no ledger reportaria sucesso e continuaria
  -- pendente para sempre. Aqui o RAISE desfaz a gravação inteira.
  IF v_ledger_posicoes + v_ledger_outras = 0 THEN
    RAISE EXCEPTION 'Candidacy % has no ledger rows - run bootstrap-ledger before ingesting research', p_candidacy_id;
  END IF;

  RETURN jsonb_build_object(
    'fontes', jsonb_array_length(p_sources),
    'posicoes', jsonb_array_length(p_positions),
    'alertas', jsonb_array_length(p_alerts),
    'dossie_versao', v_versao,
    'ledger_atualizado', v_ledger_posicoes + v_ledger_outras
  );
END;
$$;

COMMENT ON FUNCTION ingest_research_write IS
  'Grava uma pesquisa de candidato inteira numa transação só: apaga o que o pipeline gerou antes, preserva alerta resolvido e alerta aprovado por curador, e reescreve fontes, posições, alertas, dossiê e ledger. Substitui a sequência de chamadas soltas de ingest-research.ts, que apagava antes de inserir e destruía o dossiê quando o insert falhava (2026-08-25).';
