// probar.ts
import { leer_buzon } from './src/tools/contratos.ts'

async function test() {
  console.log("Probando la herramienta leer_buzon...\n")
  const contexto = { directory: process.cwd() }
  const resultadoString = await leer_buzon.execute({}, contexto)
  const resultado = JSON.parse(resultadoString)
  console.log("--- RESULTADO OBTENIDO ---")
  console.dir(resultado, { depth: null })
}

test()
