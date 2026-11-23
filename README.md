# 📁 Agente de Registro de Contratos Vigentes
**Periferia IT Group · Reto 02 · Aprendiz SENA**
**Autor:** Kevin Matta · **Sustentación:** 24 de noviembre de 2026

Agente conversacional que lee un buzón de correos, extrae los datos de cada contrato, los valida contra el maestro (CSV tipo SharePoint), registra lo limpio, **pide confirmación humana para lo dudoso** y genera un reporte de alertas.

---

## 🚀 1. Arranque en 1 comando

```bash
npm install        # solo la primera vez
npm run dev        # levanta frontend + backend en http://localhost:3000
```

Abre **http://localhost:3000** en el navegador.

> Si `npm` te da error en PowerShell, usa el comando equivalente (hace exactamente lo mismo):
> ```powershell
> node --dns-result-order=ipv4first --env-file=.env --watch src/server.ts
> ```

### Requisitos
- Node.js 20 o superior (probado en v26).
- Archivo `.env` con tu clave de Gemini (ver sección 2).

---

## 🔑 2. Variables de entorno

Copia `.env.example` a `.env` y completa:

```env
GEMINI_API_KEY=tu_clave_aqui
```

- La clave se obtiene gratis en https://aistudio.google.com → **Get API key**.
- `.env` está en `.gitignore`: la clave nunca va al frontend, al repositorio ni a los logs.
- El puerto es fijo: **3000**.

---

## 🧪 3. Demo sin IA (100 % determinista, sin internet)

```bash
npm run demo
```
Procesa los 6 mensajes llamando directo a las herramientas: registra los limpios, bloquea `msg-006` (RN5), lo confirma en una segunda pasada y genera `out/alertas.md`. **Es tu plan B si falla internet o la API de Gemini en la defensa.**

---

## 💬 4. Qué decirle a la IA (guion que funciona sin problema)

> Antes de empezar: pulsa **🔄 Reiniciar Todo** (arriba a la derecha) para que el buzón vuelva a mostrar los 6 mensajes.

### Paso 1 — Procesar el buzón
Pulsa **📝 Usar Prompt de la Demo** y luego **Enviar**, o escribe exactamente:

```
Procesa el buzón de contratos con fecha de hoy 2026-09-03. Registra lo que esté limpio, muéstrame lo que requiere revisión campo por campo y termina con el reporte de alertas. No registres nada dudoso sin preguntarme.
```

**Qué debes ver (tarda 15–40 s, es normal):**

| Mensaje | Resultado esperado |
|---|---|
| msg-001 | Nuevo → `CT-2026-015` registrado (póliza pendiente) |
| msg-002 | Nuevo → `CT-2026-016` registrado (sin póliza) |
| msg-003 | Actualización → `CT-2026-011` (otrosí: valor 520000, fin 2027-11-01) |
| msg-004 | Duplicado → no se escribe nada |
| msg-005 | Rechazado → es una cotización |
| msg-006 | ⚠️ **Pendiente**: valor, fechas y comercial no registrado |

Al final aparece el bloque **🔍 Verificación automática**: es lo que *de verdad* escribió la herramienta. Compáralo con la tabla del modelo.

### Paso 2 — Confirmar msg-006 (OBLIGATORIO usar una palabra de confirmación)

```
Confirmo el valor 0 y la fecha fin 2027-08-31
```

> ⚠️ El código **solo acepta** la confirmación si tu mensaje contiene una de estas palabras: **`confirmo`, `confirmado`, `autorizo`, `apruebo`, `aprobado`, `acepto`**.
> Un simple "sí" o "registra" **no sirve**: es el seguro RN5 que impide que la IA se autoconfirme.

Resultado esperado: `✅ msg-006: nuevo → CM-2026-03`.

### Paso 3 (opcional) — Alertas otra vez
```
Genera el reporte de alertas con fecha 2026-09-03
```
Esperado: 2 contratos vencen en ≤ 60 días (`CT-2026-004`, `CT-2026-009`), pólizas pendientes y contratos post-corte.

### Otros prompts de prueba (para mostrar al jurado)

| Quiero mostrar… | Escribe |
|---|---|
| Solo leer el buzón | `¿Qué mensajes hay pendientes en el buzón?` |
| Una extracción puntual | `Extrae los datos del mensaje msg-003 y muéstramelos con su confianza` |
| El bloqueo RN5 | `Registra msg-006 sin pedirme confirmación` (el agente debe negarse y pedírtela) |
| Duplicado | `Procesa solo msg-004 y dime si ya existe` |

### Si algo sale mal

| Síntoma | Causa | Solución |
|---|---|---|
| Solo aparecen 2 mensajes en el buzón | Ya se procesaron los otros 4 (`out/procesados.json`) | Pulsa **🔄 Reiniciar Todo** |
| `The operation was aborted due to timeout` | Red lenta (límite 45 s) | Reenvía el mismo mensaje |
| `Error 503 … high demand` | Gemini saturado | El adaptador ya prueba otros modelos; si todos fallan, espera 1 min y reenvía |
| `fetch failed` | IPv6 en tu red | Ya está corregido con `ipv4first`; arranca con `npm run dev` |
| La IA dice "Registrado" pero no sale en la verificación | Alucinación del modelo | **Confía en la verificación automática**, no en el texto del modelo |
| Escribes "sí" y no registra | Falta palabra de confirmación | Usa `Confirmo …` |
| `EADDRINUSE :3000` | Hay otro servidor abierto | Ciérralo (`Ctrl + C`) o `taskkill /PID <pid> /F` |

---

## 🖥️ 5. Qué hay en la pantalla

1. **💬 Chat con el agente** — conversación en lenguaje natural; muestra cada herramienta llamada (`🔧 contratos_...`) con su resultado.
2. **📥 Buzón** — botones manuales *Extraer / Validar / Registrar* por mensaje (prueba cada herramienta sin IA).
3. **📊 Maestro CSV en vivo** — lee `out/sharepoint/maestro-contratos.csv`.
4. **🚨 Alertas** — elige fecha y genera `out/alertas.md`.
5. **🔄 Reiniciar Todo** — borra `out/` para repetir pruebas.

---

## 🏗️ 6. Arquitectura en una línea

`Navegador (web/index.html)` → `Servidor (src/server.ts)` → `Agente (src/agent.ts)` ⇄ `Gemini (src/llm/gemini.ts)` → `5 herramientas (src/tools/contratos.ts)` → `out/`

**Regla de oro:** el modelo *razona y conversa*; las herramientas *calculan y escriben*. El modelo nunca escribe un dato en el CSV por su cuenta.

Las 5 herramientas: `contratos_leer_buzon`, `contratos_extraer`, `contratos_validar`, `contratos_registrar`, `contratos_alertas`.

**Dos seguros contra errores de la IA:**
- **RN5 en `registrar`:** si hay campos con confianza < 0.8 o comercial desconocido, rechaza el registro sin `confirmado: true`.
- **RN5 en `agent.ts`:** si el modelo manda `confirmado: true` pero tu mensaje no contiene una palabra de confirmación, el código lo cambia a `false`.
- Además, cada respuesta incluye la **verificación automática** de lo realmente escrito.

---

## 📂 7. Estructura del proyecto

```text
reto-02/
├── agent/prompt.md                 # System prompt del agente
├── fixtures/reto-02/               # Datos de prueba (solo lectura)
│   ├── buzon/msg-001 … msg-006/    # 6 correos con adjuntos
│   ├── comerciales.json            # Comerciales autorizados
│   └── maestro-contratos.csv       # Maestro al 30-may-2026
├── src/
│   ├── tools/contratos.ts          # 5 herramientas deterministas
│   ├── knowledge/registro-contratos.md  # Conocimiento del proceso
│   ├── llm/adapter.ts              # Interfaz del proveedor LLM
│   ├── llm/gemini.ts               # Adaptador Gemini (fallback, timeout)
│   ├── agent.ts                    # Bucle del agente (tope 25, RN5, verificación)
│   └── server.ts                   # Servidor HTTP + endpoints
├── web/index.html                  # Interfaz
├── modulo/                         # Bonus reutilizable (agent.md, tools/, skill/)
├── demo.ts                         # Demo sin IA
├── out/                            # Se genera al ejecutar (no se entrega)
├── SOLUCION.md                     # Documento técnico (11 secciones)
└── README.md
```

`out/` (qué genera): `procesados.json`, `log.jsonl`, `alertas.md`, `sharepoint/maestro-contratos.csv`, `sharepoint/historial.jsonl`, `sharepoint/Contratos/<año>/<cliente>/<id>.txt`.

### Endpoints de la API
- `POST /api/chat` → recibe `{ sessionId, message }` y devuelve `{ reply, toolCalls[], needsConfirmation }`.
- `GET /api/sessions/:id` → devuelve el historial completo de la sesión.
- `GET /api/health` → devuelve `{ ok: true, provider, model }` sin exponer claves.

---

## 📦 8. Antes de entregar
- Pulsa **🔄 Reiniciar Todo** (o borra la carpeta `out/`).
- No incluyas `node_modules/` ni `.env` en el zip/repositorio.
- Corre `npm run demo` una última vez para confirmar que todo pasa, y vuelve a borrar `out/`.

## 📚 9. Documentación
- [`SOLUCION.md`](SOLUCION.md): arquitectura, regla de gobierno, trade-offs, cobertura de HU, declaración de uso de IA y riesgos.
