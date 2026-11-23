// Adaptador LLM para Google Gemini
import dns from 'node:dns'
dns.setDefaultResultOrder('ipv4first')
import type { LLMAdapter, Message, ToolDef, LLMResponse, ToolCall } from './adapter.ts'

export class GeminiAdapter implements LLMAdapter {
  private apiKey: string
  private modelosCandidatos: string[]

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || ''
    if (!this.apiKey) {
      console.warn('Advertencia: GEMINI_API_KEY no encontrada en process.env')
    }
    this.modelosCandidatos = [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.5-flash'
    ]
  }

  // Envío de mensajes y herramientas a la API de Gemini
  async enviar(mensajes: Message[], herramientas: ToolDef[]): Promise<LLMResponse> {
    const systemMsg = mensajes.find(m => m.role === 'system')
    const contents: any[] = []

    // Conversión de historial
    for (const m of mensajes) {
      if (m.role === 'system') continue

      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content }] })
      } else if (m.role === 'assistant') {
        if (m.rawModelParts && m.rawModelParts.length > 0) {
          contents.push({ role: 'model', parts: m.rawModelParts })
        } else {
          contents.push({ role: 'model', parts: [{ text: m.content || '' }] })
        }
      } else if (m.role === 'tool') {
        let parsedResult: any = m.content
        try {
          parsedResult = JSON.parse(m.content)
        } catch {}

        const funcPart = {
          functionResponse: {
            name: m.name || 'tool',
            response: { result: parsedResult }
          }
        }

        const ultimoTurno = contents[contents.length - 1]
        if (ultimoTurno && ultimoTurno.role === 'user') {
          ultimoTurno.parts.push(funcPart)
        } else {
          contents.push({
            role: 'user',
            parts: [funcPart]
          })
        }
      }
    }

    // Declaraciones de herramientas
    const functionDeclarations = herramientas.map(h => ({
      name: h.name,
      description: h.description,
      parameters: {
        type: 'OBJECT',
        properties: Object.fromEntries(
          Object.entries(h.parameters.properties).map(([k, v]) => [
            k,
            { type: v.type.toUpperCase(), description: v.description }
          ])
        ),
        required: h.parameters.required || []
      }
    }))

    const body: any = {
      contents,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined
    }

    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] }
    }

    let ultimoError: any = null

    // Llamada con fallback entre modelos
    for (const modelo of this.modelosCandidatos) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${this.apiKey}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000)
        })

        if (!res.ok) {
          const errText = await res.text()
          if (res.status === 503 || res.status === 429) {
            console.warn(`[GeminiAdapter] Modelo ${modelo} ocupado (${res.status}), probando alternativa...`)
            await new Promise(resolve => setTimeout(resolve, 1500))
            ultimoError = new Error(`Error ${res.status}: ${errText}`)
            continue
          }
          throw new Error(`Error en API Gemini (${res.status}): ${errText}`)
        }

        const data = await res.json()
        const candidate = data.candidates?.[0]?.content
        const parts = candidate?.parts || []

        let content: string | null = null
        const tool_calls: ToolCall[] = []

        for (const part of parts) {
          if (part.text) {
            content = (content ? content + '\n' : '') + part.text
          }
          if (part.functionCall) {
            tool_calls.push({
              id: part.functionCall.id || ('call_' + Math.random().toString(36).substring(2, 9)),
              name: part.functionCall.name,
              arguments: part.functionCall.args || {}
            })
          }
        }

        return { content, tool_calls, rawModelParts: parts }

      } catch (e: any) {
        ultimoError = e
        console.warn(`[GeminiAdapter] Intento fallido con ${modelo}: ${e.message}`)
        if (!e.message.includes('503') && !e.message.includes('429') && !e.message.includes('fetch failed') && !e.message.includes('timeout')) {
          throw e
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    throw ultimoError || new Error('No se pudo conectar con ningún modelo de Gemini disponible.')
  }
}
