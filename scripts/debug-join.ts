import { supabase } from './lib/supabase.js'

const { data, error } = await supabase
  .from('candidacies')
  .select('politician_id, cargo, estado, numero_urna, politicians!inner(id, nome_urna)')
  .eq('ano_eleicao', 2022).eq('turno', 1).eq('estado', 'SP').limit(2)

if (error) console.error(error)
else console.log(JSON.stringify(data?.[0], null, 2))
