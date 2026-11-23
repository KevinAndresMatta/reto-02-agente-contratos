// Servidor HTTP principal
import 'dotenv/config'
import dns from 'node:dns'
dns.setDefaultResultOrder('ipv4first')
import http from 'http'
import fs from 'fs'
import path from 'path'
import { leer_buzon, extraer, validar, registrar, alertas } from './tools/contratos.ts'
import { GeminiAdapter } from './llm/gemini.ts'
import { obtenerOSesion, ejecutarCicloAgente } from './agent.ts'

const PORT = Number(process.env.PORT) || 3000
const DIRECTORY = process.cwd()
const adapter = new GeminiAdapter()

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  // Vista principal
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const rutaHtml = path.join(DIRECTORY, 'web', 'index.html')
    if (fs.existsSync(rutaHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(fs.readFileSync(rutaHtml, 'utf-8'))
      return
    }
  }

  // Chat con el agente
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { sessionId, message } = JSON.parse(body || '{}')
        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Se requiere el campo message' }))
          return
        }

        const sid = sessionId || 'sesion_default'
        const sesion = obtenerOSesion(sid, DIRECTORY)

        const resultado = await ejecutarCicloAgente(message, sesion, adapter, DIRECTORY)

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(resultado))

      } catch (err: any) {
        console.error('Error en /api/chat:', err)
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({
          reply: `Lo siento, ocurrió un error al procesar tu solicitud: ${err.message}`,
          toolCalls: [],
          needsConfirmation: false
        }))
      }
    })
    return
  }

  // Historial de sesión
  if (url.pathname.startsWith('/api/sessions/') && req.method === 'GET') {
    const sid = url.pathname.replace('/api/sessions/', '')
    const sesion = obtenerOSesion(sid, DIRECTORY)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(sesion.historial))
    return
  }

  // Health check
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite' }))
    return
  }

  // Endpoints de pruebas directas
  if (url.pathname === '/api/test/leer-buzon' && req.method === 'GET') {
    const resultado = await leer_buzon.execute({}, { directory: DIRECTORY })
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(resultado)
    return
  }

  if (url.pathname === '/api/test/extraer' && req.method === 'GET') {
    const id = url.searchParams.get('id') || 'msg-001'
    const resultado = await extraer.execute({ mensaje_id: id }, { directory: DIRECTORY })
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(resultado)
    return
  }

  if (url.pathname === '/api/test/validar' && req.method === 'GET') {
    const id = url.searchParams.get('id') || 'msg-001'
    const resExtraer = await extraer.execute({ mensaje_id: id }, { directory: DIRECTORY })
    const jsonExtraer = JSON.parse(resExtraer)

    if (!jsonExtraer.ok) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        ok: true,
        data: { clasificacion: 'rechazado', motivo: jsonExtraer.error, requiere_revision: [] }
      }))
      return
    }

    const resultadoValidar = await validar.execute({
      mensaje_id: id,
      contrato: jsonExtraer.data
    }, { directory: DIRECTORY })

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(resultadoValidar)
    return
  }

  if (url.pathname === '/api/test/registrar' && req.method === 'GET') {
    const id = url.searchParams.get('id') || 'msg-001'
    const confirmado = url.searchParams.get('confirmado') === 'true'

    const resExtraer = await extraer.execute({ mensaje_id: id }, { directory: DIRECTORY })
    const jsonExtraer = JSON.parse(resExtraer)

    if (!jsonExtraer.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: jsonExtraer.error }))
      return
    }

    const resultadoRegistrar = await registrar.execute({
      mensaje_id: id,
      contrato: jsonExtraer.data,
      confirmado
    }, { directory: DIRECTORY })

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(resultadoRegistrar)
    return
  }

  if (url.pathname === '/api/test/alertas' && req.method === 'GET') {
    const hoy = url.searchParams.get('hoy') || '2026-09-03'
    const resultado = await alertas.execute({ hoy }, { directory: DIRECTORY })
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(resultado)
    return
  }

  if (url.pathname === '/api/test/maestro' && req.method === 'GET') {
    const rutaMaestro = path.join(DIRECTORY, 'out', 'sharepoint', 'maestro-contratos.csv')
    if (!fs.existsSync(rutaMaestro)) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, data: [] }))
      return
    }
    const contenido = fs.readFileSync(rutaMaestro, 'utf-8').trim()
    const lineas = contenido.split('\n')
    const encabezados = lineas[0].split(',')
    const filas = lineas.slice(1).map(l => {
      const valores: string[] = []
      let actual = ''
      let enComillas = false
      for (let i = 0; i < l.length; i++) {
        const c = l[i]
        if (c === '"') enComillas = !enComillas
        else if (c === ',' && !enComillas) {
          valores.push(actual.trim())
          actual = ''
        } else actual += c
      }
      valores.push(actual.trim())
      const obj: Record<string, string> = {}
      encabezados.forEach((h, idx) => { obj[h.trim()] = valores[idx] || '' })
      return obj
    })
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, data: filas }))
    return
  }

  // Reinicio de datos de salida
  if (url.pathname === '/api/test/reiniciar') {
    const rutaOut = path.join(DIRECTORY, 'out')
    if (fs.existsSync(rutaOut)) {
      fs.rmSync(rutaOut, { recursive: true, force: true })
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, mensaje: 'Directorio out reiniciado correctamente.' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Ruta no encontrada')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor visual listo en: http://localhost:${PORT}`)
})
