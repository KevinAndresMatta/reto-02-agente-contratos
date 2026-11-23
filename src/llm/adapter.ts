// Interfaz para proveedores LLM

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
  rawModelParts?: any[]
}

export interface ToolDef {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
}

export interface LLMResponse {
  content: string | null
  tool_calls: ToolCall[]
  rawModelParts?: any[]
}

export interface LLMAdapter {
  enviar(mensajes: Message[], herramientas: ToolDef[]): Promise<LLMResponse>
}
