// Ciclo conversacional del agente
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import type { LLMAdapter, Message, ToolDef } from './llm/adapter.ts'
import { leer_buzon, extraer, validar, registrar, alertas } from './tools/contratos.ts'

// Mapa de herramientas
const herramientasObj: Record<string, any> = {
  contratos_leer_buzon: leer_buzon,
  contratos_extraer: extraer,
  contratos_validar: validar,
  contratos_registrar: registrar,
  contratos_alertas: alertas
}

// Definiciones de herramientas
export const definicionesHerramientas: ToolDef[] = [
  {
    name: 'contratos_leer_buzon',
    description: leer_buzon.description,
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'contratos_extraer',
    description: extraer.description,
    parameters: {
      type: 'object',
      properties: {
        mensaje_id: { type: 'string', description: 'ID del mensaje (ej: msg-001)' }
      },
      required: ['mensaje_id']
    }
  },
  {
    name: 'contratos_validar',
    description: validar.description,
    parameters: {
      type: 'object',
      properties: {
        mensaje_id: { type: 'string', description: 'ID del mensaje' },
        contrato: { type: 'object', description: 'Objeto con datos del contrato extraído' }
      },
      required: ['mensaje_id', 'contrato']
    }
  },
  {
    name: 'contratos_registrar',
    description: registrar.description,
    parameters: {
      type: 'object',
      properties: {
        mensaje_id: { type: 'string', description: 'ID del mensaje' },
        contrato: { type: 'object', description: 'Objeto contrato a registrar' },
        confirmado: { type: 'boolean', description: 'true si la analista autorizó campos dudosos' }
      },
      required: ['mensaje_id', 'contrato']
    }
  },
  {
    name: 'contratos_alertas',
    description: alertas.description,
    parameters: {
      type: 'object',
      properties: {
        hoy: { type: 'string', description: 'Fecha de referencia YYYY-MM-DD (ej: 2026-09-03)' }
      },
      required: ['hoy']
    }
  }
]

export interface SesionChat {
  id: string
  historial: Message[]
}

const sesiones = new Map<string, SesionChat>()

// Gestión de sesiones
export function obtenerOSesion(sessionId: string, directorio: string): SesionChat {
  if (!sesiones.has(sessionId)) {
    const promptPath = path.join(directorio, 'agent', 'prompt.md')
    const promptTexto = fs.existsSync(promptPath)
      ? fs.readFileSync(promptPath, 'utf-8')
      : 'Eres un agente de registro de contratos vigentes.'

    sesiones.set(sessionId, {
      id: sessionId,
      historial: [{ role: 'system', content: promptTexto }]
    })
  }
  return sesiones.get(sessionId)!
}

// Bucle principal del agente
export async function ejecutarCicloAgente(
  mensajeUsuario: string,
  sesion: SesionChat,
  adapter: LLMAdapter,
  directorio: string
): Promise<{ reply: string; toolCalls: Array<{ name: string; args: any; resultado: any }>; needsConfirmation: boolean }> {
  sesion.historial.push({ role: 'user', content: mensajeUsuario })

  const MAX_ITERACIONES = 25
  const usuarioConfirmo = /\b(confirmo|confirmado|autorizo|apruebo|aprobado|acepto)\b/i.test(mensajeUsuario)
  let iteracion = 0
  const registroToolCalls: Array<{ name: string; args: any; resultado: any }> = []
  let needsConfirmation = false

  while (iteracion < MAX_ITERACIONES) {
    iteracion++

    const respuesta = await adapter.enviar(sesion.historial, definicionesHerramientas)

    if (respuesta.tool_calls && respuesta.tool_calls.length > 0) {
      sesion.historial.push({
        role: 'assistant',
        content: respuesta.content || '',
        rawModelParts: respuesta.rawModelParts
      })

      // Ejecución de herramientas
      for (const call of respuesta.tool_calls) {
        const herramienta = herramientasObj[call.name]
        let resultadoStr = ''
        let resultadoParsed: any = {}

        if (herramienta) {
          try {
            const schema = z.object(herramienta.args || {})
            const validacion = schema.safeParse(call.arguments || {})
            if (!validacion.success) {
              resultadoStr = JSON.stringify({ ok: false, error: `Argumentos inválidos: ${validacion.error.message}` })
              resultadoParsed = JSON.parse(resultadoStr)
            } else {
              const argsValidados: any = validacion.data
              if (call.name === 'contratos_registrar' && argsValidados.confirmado === true && !usuarioConfirmo) {
                argsValidados.confirmado = false
              }
              resultadoStr = await herramienta.execute(argsValidados, { directory: directorio, sessionId: sesion.id })
              resultadoParsed = JSON.parse(resultadoStr)
            }
          } catch (e) {
            resultadoStr = JSON.stringify({ ok: false, error: String(e) })
            resultadoParsed = { ok: false, error: String(e) }
          }
        } else {
          resultadoStr = JSON.stringify({ ok: false, error: `Herramienta desconocida: ${call.name}` })
          resultadoParsed = { ok: false, error: `Herramienta desconocida: ${call.name}` }
        }

        if (resultadoParsed?.data?.requiere_revision?.length > 0 || (resultadoParsed?.error && resultadoParsed?.error.includes('requiere revisión'))) {
          needsConfirmation = true
        }

        registroToolCalls.push({
          name: call.name,
          args: call.arguments,
          resultado: resultadoParsed
        })

        sesion.historial.push({
          role: 'tool',
          name: call.name,
          content: resultadoStr,
          tool_call_id: call.id
        })
      }

      continue

    } else {
      // Respuesta final
      const respuestaTexto = respuesta.content || 'Proceso completado.'
      sesion.historial.push({ role: 'assistant', content: respuestaTexto })

      if (respuestaTexto.toLowerCase().includes('confirmas') || respuestaTexto.toLowerCase().includes('requiere revisión') || respuestaTexto.toLowerCase().includes('¿')) {
        needsConfirmation = true
      }

      // Verificación de registros ejecutados
      const registrosReales = registroToolCalls.filter(t => t.name === 'contratos_registrar')
      let replyFinal = respuestaTexto
      if (registrosReales.length > 0 || /registrad/i.test(respuestaTexto)) {
        const lineas = registrosReales.map(t =>
          t.resultado?.ok
            ? `- ✅ ${t.args?.mensaje_id}: ${t.resultado.data?.accion} → ${t.resultado.data?.id_contrato}`
            : `- ⛔ ${t.args?.mensaje_id}: NO registrado (${String(t.resultado?.error || '').slice(0, 90)})`
        )
        replyFinal += `\n\n---\n🔍 **Verificación automática (lo que de verdad escribió la herramienta en este turno):**\n` +
          (lineas.length ? lineas.join('\n') : '- Ningún contrato fue escrito en el maestro en este turno.')
      }

      return {
        reply: replyFinal,
        toolCalls: registroToolCalls,
        needsConfirmation
      }
    }
  }

  const avisoTope = 'Se ha alcanzado el límite máximo de iteraciones por turno (25). Aquí tienes el resumen de lo procesado hasta ahora.'
  sesion.historial.push({ role: 'assistant', content: avisoTope })
  return { reply: avisoTope, toolCalls: registroToolCalls, needsConfirmation: false }
}
