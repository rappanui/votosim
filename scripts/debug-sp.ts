import { supabase } from './lib/supabase.js'
const { count } = await supabase.from('candidacies').select('*', { count: 'exact', head: true }).eq('estado', 'SP').eq('ano_eleicao', 2022)
console.log('SP candidacies:', count)
const { data } = await supabase.from('politicians').select('id, nome_urna').or('nome_urna.ilike.%RODRIGO GARCIA%,nome_urna.ilike.%VINICIUS POIT%,nome_urna.ilike.%HADDAD%').limit(5)
console.log('Found:', JSON.stringify(data))
