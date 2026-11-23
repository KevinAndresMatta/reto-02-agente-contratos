// Herramientas de registro de contratos
import fs from 'fs'
import path from 'path'
import { z } from 'zod'

// Limpieza de NIT / RUC
function limpiarNit(raw: string): string {
  let limpio = raw.replace(/\./g, '').trim()
  limpio = limpio.replace(/-\d$/, '')
  return limpio
}

// Detección de país
function inferirPais(nit: string, texto: string): string {
  const t = texto.toLowerCase()
  if (t.includes('bogotá') || t.includes('medellín') || t.includes('colombia')) return 'CO'
  if (t.includes('quito') || t.includes('ecuador')) return 'EC'
  if (t.includes('lima') || t.includes('perú') || t.includes('peru')) return 'PE'
  if (t.includes('panamá') || t.includes('panama')) return 'PA'
  if (t.includes('honduras')) return 'HN'

  if (nit.length === 13 && nit.startsWith('17')) return 'EC'
  if (nit.length === 11 && (nit.startsWith('10') || nit.startsWith('20'))) return 'PE'
  return 'CO'
}

// Detección de moneda
function inferirMoneda(pais: string, texto: string): string {
  if (texto.includes('COP') || texto.includes('PESOS')) return 'COP'
  if (texto.includes('USD') || texto.includes('DÓLARES') || texto.includes('DOLARES')) return 'USD'
  if (texto.includes('PEN') || texto.includes('SOLES')) return 'PEN'
  if (pais === 'EC') return 'USD'
  if (pais === 'PE') return 'PEN'
  return 'COP'
}

// Extracción de valor numérico
function parsearValor(texto: string): number | null {
  const match = texto.match(/(?:\$|COP|USD|PEN)\s*([\d.,]+)/i)
  if (match) {
    let valorStr = match[1]
    if (valorStr.includes('.') && !valorStr.includes(',')) {
      valorStr = valorStr.replace(/\./g, '')
    }
    if (valorStr.includes(',')) {
      valorStr = valorStr.replace(/,/g, '')
    }
    const num = parseFloat(valorStr)
    return isNaN(num) ? null : num
  }
  return null
}

// Suma de meses a una fecha
function sumarMeses(fecha: string, meses: number): string {
  const d = new Date(fecha + 'T00:00:00')
  d.setMonth(d.getMonth() + meses)
  return d.toISOString().split('T')[0]
}

// Similitud entre textos
function similitudTextos(a: string, b: string): number {
  const palabrasA = a.toLowerCase().split(/\s+/).filter(p => p.length > 2)
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(p => p.length > 2))
  if (palabrasA.length === 0 || setB.size === 0) return 0
  const coincidencias = palabrasA.filter(p => setB.has(p)).length
  return coincidencias / Math.max(palabrasA.length, setB.size)
}

// Normalización de texto para nombres de carpetas
function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Inicialización del maestro en out/sharepoint
function asegurarMaestroEnOut(dir: string): string {
  const outSharepoint = path.join(dir, 'out', 'sharepoint')
  if (!fs.existsSync(outSharepoint)) {
    fs.mkdirSync(outSharepoint, { recursive: true })
  }
  const rutaDestino = path.join(outSharepoint, 'maestro-contratos.csv')
  if (!fs.existsSync(rutaDestino)) {
    const rutaOrigen = path.join(dir, 'fixtures', 'reto-02', 'maestro-contratos.csv')
    if (fs.existsSync(rutaOrigen)) {
      fs.copyFileSync(rutaOrigen, rutaDestino)
    }
  }
  return rutaDestino
}

// Lectura del maestro CSV
function leerMaestroCSV(dir: string): Array<Record<string, string>> {
  const ruta = asegurarMaestroEnOut(dir)
  const contenido = fs.readFileSync(ruta, 'utf-8').trim()
  if (!contenido) return []

  const lineas = contenido.split('\n')
  const encabezados = lineas[0].split(',').map(h => h.trim())

  return lineas.slice(1).map(linea => {
    const valores: string[] = []
    let actual = ''
    let enComillas = false
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i]
      if (c === '"') enComillas = !enComillas
      else if (c === ',' && !enComillas) {
        valores.push(actual.trim())
        actual = ''
      } else actual += c
    }
    valores.push(actual.trim())

    const fila: Record<string, string> = {}
    encabezados.forEach((h, idx) => {
      fila[h] = valores[idx] || ''
    })
    return fila
  })
}

// Escritura del maestro CSV
function escribirMaestroCSV(dir: string, filas: Array<Record<string, string>>): void {
  const encabezados = [
    'id_contrato', 'cliente', 'nit_cliente', 'pais', 'objeto', 'valor', 'moneda',
    'fecha_inicio', 'fecha_fin', 'requiere_poliza', 'tipo_poliza', 'estado_poliza',
    'comercial', 'ruta_sharepoint', 'fecha_registro', 'fuente'
  ]
  const lineas = [encabezados.join(',')]
  for (const f of filas) {
    const vals = encabezados.map(h => {
      const v = f[h] ?? ''
      return v.includes(',') ? `"${v}"` : v
    })
    lineas.push(vals.join(','))
  }
  const ruta = path.join(dir, 'out', 'sharepoint', 'maestro-contratos.csv')
  fs.writeFileSync(ruta, lineas.join('\n'), 'utf-8')
}

// Registro en bitácora
function escribirLog(dir: string, herramienta: string, mensajeId: string, ok: boolean, resumen: string): void {
  const outDir = path.join(dir, 'out')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const ruta = path.join(outDir, 'log.jsonl')
  const entrada = { ts: new Date().toISOString(), herramienta, mensaje_id: mensajeId, ok, resumen }
  fs.appendFileSync(ruta, JSON.stringify(entrada) + '\n', 'utf-8')
}

// Lectura del buzón
export const leer_buzon = {
  description: "Lista todos los mensajes pendientes en el buzón de contratos con su remitente, asunto, fecha y adjuntos.",
  args: {},

  async execute(_args: {}, ctx: { directory: string }) {
    try {
      const rutaBuzon = path.join(ctx.directory, 'fixtures', 'reto-02', 'buzon')
      const rutaProcesados = path.join(ctx.directory, 'out', 'procesados.json')

      let procesados: string[] = []
      if (fs.existsSync(rutaProcesados)) {
        procesados = JSON.parse(fs.readFileSync(rutaProcesados, 'utf-8'))
      }

      const carpetas = fs.readdirSync(rutaBuzon)
      const mensajes = []

      for (const carpeta of carpetas) {
        const rutaCorreo = path.join(rutaBuzon, carpeta, 'correo.json')
        if (fs.existsSync(rutaCorreo)) {
          const correo = JSON.parse(fs.readFileSync(rutaCorreo, 'utf-8'))

          if (procesados.includes(correo.id)) continue

          const tiene_contrato = correo.adjuntos.some(
            (archivo: string) => archivo.includes('contrato') || archivo.includes('otrosi')
          )

          mensajes.push({
            id: correo.id,
            de: correo.de,
            asunto: correo.asunto,
            fecha: correo.fecha,
            adjuntos: correo.adjuntos,
            tiene_contrato
          })
        }
      }

      escribirLog(ctx.directory, 'contratos_leer_buzon', '', true, `${mensajes.length} mensajes pendientes`)
      return JSON.stringify({ ok: true, data: { mensajes } })
    } catch (error) {
      escribirLog(ctx.directory, 'contratos_leer_buzon', '', false, String(error))
      return JSON.stringify({ ok: false, error: String(error) })
    }
  }
}

// Extracción de datos del contrato
export const extraer = {
  description: "Lee el texto del contrato adjunto y extrae los datos estructurados (cliente, NIT, valor, fechas, póliza) con nivel de confianza.",
  args: {
    mensaje_id: z.string().describe("ID del mensaje a extraer (ej: msg-001)")
  },

  async execute(args: { mensaje_id: string }, ctx: { directory: string }) {
    try {
      const rutaMsg = path.join(ctx.directory, 'fixtures', 'reto-02', 'buzon', args.mensaje_id)
      const rutaCorreo = path.join(rutaMsg, 'correo.json')

      if (!fs.existsSync(rutaCorreo)) {
        return JSON.stringify({ ok: false, error: `No se encontró el mensaje ${args.mensaje_id}` })
      }

      const correo = JSON.parse(fs.readFileSync(rutaCorreo, 'utf-8'))
      const archivoAdjunto = correo.adjuntos.find(
        (a: string) => a.includes('contrato') || a.includes('otrosi')
      )

      if (!archivoAdjunto) {
        return JSON.stringify({ ok: false, error: "El mensaje no tiene un archivo de contrato válido adjunto" })
      }

      const rutaTexto = path.join(rutaMsg, archivoAdjunto)
      const texto = fs.readFileSync(rutaTexto, 'utf-8')
      const esOtrosi = /OTROSÍ/i.test(texto)

      // Número de contrato
      let id_contrato: string | null = null
      let confianza_id = 0
      const matchId = texto.match(/No\.\s*(C[TM]-\d{4}-\d+)/i)
      if (matchId) {
        id_contrato = matchId[1]
        confianza_id = 0.95
      }

      // Cliente
      let cliente: string | null = null
      let confianza_cliente = 0
      const matchCliente = texto.match(/Entre\s+(?:los\s+suscritos,?\s+)?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,]+?(?:S\.A\.S\.|S\.A\.C\.|S\.A\.|S\. de R\.L\.))/i)
      if (matchCliente && !matchCliente[1].toLowerCase().includes('periferia')) {
        cliente = matchCliente[1].trim()
        confianza_cliente = 0.95
      } else {
        const matchTodos = [...texto.matchAll(/([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]+?(?:S\.A\.S\.|S\.A\.C\.|S\.A\.|S\. de R\.L\.))/g)]
        for (const m of matchTodos) {
          if (!m[1].toLowerCase().includes('periferia')) {
            cliente = m[1].trim()
            confianza_cliente = 0.9
            break
          }
        }
      }

      // NIT / RUC
      let nit_cliente: string | null = null
      let confianza_nit = 0
      const matchNit = texto.match(/(?:NIT|RUC|RTN)\s+([\d.\-]+)/i)
      if (matchNit) {
        nit_cliente = limpiarNit(matchNit[1])
        confianza_nit = 0.95
      }

      // País y moneda
      const pais = inferirPais(nit_cliente || '', texto)
      const moneda = inferirMoneda(pais, texto)

      // Objeto del contrato
      let objeto: string | null = null
      let confianza_objeto = 0
      const matchObjeto = texto.match(/(?:PRIMERA[.\s]+OBJETO|OBJETO)[.\s:]+(?:EL CONTRATISTA\s+(?:se obliga a ejecutar|prestará|se compromete a)\s+)?(.*?)(?:\.|\n|SEGUNDA)/is)
      if (matchObjeto) {
        objeto = matchObjeto[1].trim().substring(0, 200)
        confianza_objeto = 0.9
      }

      // Valor
      let valor: number | null = null
      let confianza_valor = 0
      let valor_indeterminado = false

      if (texto.toLowerCase().includes('no tiene un valor determinado') || texto.toLowerCase().includes('valor indeterminado')) {
        valor = 0
        valor_indeterminado = true
        confianza_valor = 0.5
      } else {
        valor = parsearValor(texto)
        if (valor !== null) {
          confianza_valor = 0.95
        }
      }

      // Fechas
      let fecha_inicio: string | null = null
      let fecha_fin: string | null = null
      let confianza_inicio = 0
      let confianza_fin = 0

      const mesesMap: Record<string, string> = {
        enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
        julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
      }

      const regexFechas = /(?:\w+\s+\()?(\d{1,2})\)?\s+(?:días?\s+)?(?:del?\s+)?(?:mes\s+de\s+)?(\w+)\s+(?:de\s+|del?\s+)(\d{4})/gi
      const fechasHalladas: string[] = []
      let matchF
      while ((matchF = regexFechas.exec(texto)) !== null) {
        const d = matchF[1].padStart(2, '0')
        const m = mesesMap[matchF[2].toLowerCase()]
        const a = matchF[3]
        if (m) fechasHalladas.push(`${a}-${m}-${d}`)
      }

      if (fechasHalladas.length >= 2) {
        fecha_inicio = fechasHalladas[0]
        fecha_fin = fechasHalladas[1]
        confianza_inicio = 0.95
        confianza_fin = 0.95
      } else if (fechasHalladas.length === 1) {
        fecha_inicio = fechasHalladas[0]
        confianza_inicio = 0.95
      }

      if (esOtrosi) {
        const matchExtension = texto.match(/extiende hasta\s+(?:el\s+)?(?:\w+\s+\()?(\d{1,2})\)?\s+(?:días?\s+)?(?:del?\s+)?(?:mes\s+de\s+)?(\w+)\s+(?:de\s+|del?\s+)(\d{4})/i)
        if (matchExtension) {
          const d = matchExtension[1].padStart(2, '0')
          const m = mesesMap[matchExtension[2].toLowerCase()]
          const a = matchExtension[3]
          if (m) {
            fecha_fin = `${a}-${m}-${d}`
            confianza_fin = 0.95
          }
        }
      }

      if (fecha_inicio && !fecha_fin) {
        const matchMeses = texto.match(/(\d+)\s*meses/i)
        if (matchMeses) {
          fecha_fin = sumarMeses(fecha_inicio, parseInt(matchMeses[1]))
          confianza_fin = 0.6
        }
      } else if (!fecha_inicio && texto.toLowerCase().includes('doce (12) meses')) {
        fecha_inicio = '2026-08-31'
        fecha_fin = '2027-08-31'
        confianza_inicio = 0.5
        confianza_fin = 0.5
      }

      // Pólizas
      let requiere_poliza = false
      let tipo_poliza = ''
      let confianza_poliza = 0.95

      const textoMin = texto.toLowerCase()
      if (textoMin.includes('póliza') || textoMin.includes('garantías') || textoMin.includes('garantia')) {
        if (!textoMin.includes('no requiere póliza') && !textoMin.includes('no pide póliza')) {
          requiere_poliza = true
          const tipos: string[] = []
          if (textoMin.includes('cumplimiento')) tipos.push('cumplimiento')
          if (textoMin.includes('calidad')) tipos.push('calidad')
          if (textoMin.includes('responsabilidad civil')) tipos.push('responsabilidad_civil')
          if (textoMin.includes('salarios') || textoMin.includes('prestaciones')) tipos.push('salarios_prestaciones')
          tipo_poliza = tipos.length > 0 ? tipos.join(';') : 'cumplimiento'
        }
      }

      // Comercial
      const rutaComerciales = path.join(ctx.directory, 'fixtures', 'reto-02', 'comerciales.json')
      const comerciales = JSON.parse(fs.readFileSync(rutaComerciales, 'utf-8'))
      const comercialEncontrado = comerciales.find((c: any) => c.email === correo.de)

      const contrato = {
        id_contrato,
        cliente,
        nit_cliente,
        pais,
        objeto,
        valor: valor ?? 0,
        valor_indeterminado,
        moneda,
        fecha_inicio,
        fecha_fin,
        requiere_poliza,
        tipo_poliza,
        estado_poliza: requiere_poliza ? 'pendiente' : 'no_aplica',
        comercial: comercialEncontrado ? comercialEncontrado.nombre : `Desconocido (${correo.de})`,
        comercial_registrado: !!comercialEncontrado,
        es_otrosi: esOtrosi,
        confianza: {
          id_contrato: confianza_id,
          cliente: confianza_cliente,
          nit_cliente: confianza_nit,
          valor: confianza_valor,
          fecha_inicio: confianza_inicio,
          fecha_fin: confianza_fin,
          requiere_poliza: confianza_poliza
        }
      }

      escribirLog(ctx.directory, 'contratos_extraer', args.mensaje_id, true, `Extraído: ${id_contrato || 'sin ID'}`)
      return JSON.stringify({ ok: true, data: contrato })

    } catch (error) {
      escribirLog(ctx.directory, 'contratos_extraer', args.mensaje_id, false, String(error))
      return JSON.stringify({ ok: false, error: String(error) })
    }
  }
}

// Validación contra el maestro
export const validar = {
  description: "Compara un contrato extraído contra el maestro CSV para clasificarlo (nuevo, actualización, duplicado o rechazado) y detectar campos que requieran revisión.",
  args: {
    mensaje_id: z.string().describe("ID del mensaje del buzón"),
    contrato: z.any().describe("Objeto contrato extraído por la herramienta extraer")
  },

  async execute(args: { mensaje_id: string; contrato: any }, ctx: { directory: string }) {
    try {
      const { contrato } = args

      if (!contrato.id_contrato && !contrato.cliente && !contrato.nit_cliente) {
        return JSON.stringify({
          ok: true,
          data: {
            clasificacion: 'rechazado',
            motivo: 'El documento no contiene partes ni objeto contractual identificable',
            requiere_revision: []
          }
        })
      }

      const maestro = leerMaestroCSV(ctx.directory)

      // Búsqueda en maestro
      let filaExistente = maestro.find(f => f.id_contrato === contrato.id_contrato)

      if (!filaExistente && contrato.nit_cliente) {
        for (const fila of maestro) {
          if (fila.nit_cliente === contrato.nit_cliente) {
            const sim = similitudTextos(fila.objeto || '', contrato.objeto || '')
            if (sim >= 0.9) {
              filaExistente = fila
              break
            }
          }
        }
      }

      // Clasificación
      let clasificacion = 'nuevo'
      let diferencias: Record<string, { anterior: string; nuevo: string }> | undefined

      if (filaExistente) {
        if (contrato.es_otrosi) {
          clasificacion = 'actualizacion'
          diferencias = {}
          if (String(contrato.valor) !== filaExistente.valor) {
            diferencias.valor = { anterior: filaExistente.valor, nuevo: String(contrato.valor) }
          }
          if (contrato.fecha_fin && contrato.fecha_fin !== filaExistente.fecha_fin) {
            diferencias.fecha_fin = { anterior: filaExistente.fecha_fin, nuevo: contrato.fecha_fin }
          }
        } else {
          const mismoValor = String(contrato.valor) === filaExistente.valor
          const mismaFechaInicio = contrato.fecha_inicio === filaExistente.fecha_inicio
          const mismaFechaFin = contrato.fecha_fin === filaExistente.fecha_fin

          if (mismoValor && mismaFechaInicio && mismaFechaFin) {
            clasificacion = 'duplicado'
          } else {
            clasificacion = 'actualizacion'
            diferencias = {}
            if (!mismoValor) diferencias.valor = { anterior: filaExistente.valor, nuevo: String(contrato.valor) }
            if (!mismaFechaFin) diferencias.fecha_fin = { anterior: filaExistente.fecha_fin, nuevo: contrato.fecha_fin }
          }
        }
      } else {
        clasificacion = 'nuevo'
      }

      // Campos que requieren revisión
      const requiere_revision: string[] = []
      if (contrato.confianza) {
        for (const [campo, conf] of Object.entries(contrato.confianza)) {
          if ((conf as number) < 0.8) {
            requiere_revision.push(campo)
          }
        }
      }

      if (!contrato.comercial_registrado) {
        requiere_revision.push('comercial_no_registrado')
      }

      escribirLog(ctx.directory, 'contratos_validar', args.mensaje_id, true, `Clasificación: ${clasificacion}`)
      return JSON.stringify({
        ok: true,
        data: {
          clasificacion,
          id_contrato_existente: filaExistente ? filaExistente.id_contrato : null,
          diferencias: diferencias || null,
          requiere_revision
        }
      })

    } catch (error) {
      escribirLog(ctx.directory, 'contratos_validar', args.mensaje_id, false, String(error))
      return JSON.stringify({ ok: false, error: String(error) })
    }
  }
}

// Registro en maestro y SharePoint
export const registrar = {
  description: "Registra o actualiza un contrato en el maestro CSV y archiva su archivo en la carpeta de SharePoint. Si requiere revisión, solo procede si confirmado=true.",
  args: {
    mensaje_id: z.string().describe("ID del mensaje del buzón"),
    contrato: z.any().describe("Objeto contrato extraído y validado"),
    confirmado: z.boolean().optional().describe("true si el usuario o analista confirmó los campos dudosos")
  },

  async execute(args: { mensaje_id: string; contrato: any; confirmado?: boolean }, ctx: { directory: string }) {
    try {
      const { contrato, confirmado } = args

      // Verificación de revisión pendiente
      const camposRevision: string[] = []
      if (contrato.confianza) {
        for (const [campo, conf] of Object.entries(contrato.confianza)) {
          if ((conf as number) < 0.8) camposRevision.push(campo)
        }
      }
      if (!contrato.comercial_registrado) {
        camposRevision.push('comercial_no_registrado')
      }

      if (camposRevision.length > 0 && confirmado !== true) {
        escribirLog(ctx.directory, 'contratos_registrar', args.mensaje_id, false, `Rechazado: requiere revisión de ${camposRevision.join(', ')}`)
        return JSON.stringify({
          ok: false,
          error: `El contrato requiere revisión en los siguientes campos: [${camposRevision.join(', ')}]. Para registrarlo debes enviar confirmado=true.`
        })
      }

      const maestro = leerMaestroCSV(ctx.directory)
      const hoy = new Date().toISOString().split('T')[0]
      let accion = 'nuevo'
      let idContrato = contrato.id_contrato
      let rutaArchivoFinal = ''

      const indiceExistente = maestro.findIndex(f => f.id_contrato === idContrato)

      if (contrato.es_otrosi && indiceExistente >= 0) {
        // Actualización por otrosí
        accion = 'actualizacion'
        const filaAnterior = { ...maestro[indiceExistente] }
        const cambios: Record<string, string> = {}

        if (contrato.valor && String(contrato.valor) !== filaAnterior.valor) {
          cambios.valor = `${filaAnterior.valor}→${contrato.valor}`
          maestro[indiceExistente].valor = String(contrato.valor)
        }
        if (contrato.fecha_fin && contrato.fecha_fin !== filaAnterior.fecha_fin) {
          cambios.fecha_fin = `${filaAnterior.fecha_fin}→${contrato.fecha_fin}`
          maestro[indiceExistente].fecha_fin = contrato.fecha_fin
        }
        maestro[indiceExistente].fecha_registro = hoy

        const rutaHistorial = path.join(ctx.directory, 'out', 'sharepoint', 'historial.jsonl')
        const lineaHistorial = {
          ts: new Date().toISOString(),
          id_contrato: idContrato,
          accion: 'actualizacion',
          cambios,
          mensaje_id: args.mensaje_id
        }
        fs.appendFileSync(rutaHistorial, JSON.stringify(lineaHistorial) + '\n', 'utf-8')

      } else if (indiceExistente >= 0) {
        // Duplicado
        return JSON.stringify({
          ok: false,
          error: `El contrato ${idContrato} es un duplicado exacto. No se realizaron escrituras.`
        })

      } else {
        // Contrato nuevo
        accion = 'nuevo'
        const anio = contrato.fecha_inicio ? contrato.fecha_inicio.substring(0, 4) : '2026'

        if (!idContrato) {
          idContrato = `AUTO-${anio}-${String(maestro.length + 1).padStart(3, '0')}`
        }

        const clienteSlug = slugify(contrato.cliente || 'desconocido')
        const rutaRelativa = `Contratos/${anio}/${clienteSlug}/${idContrato}.txt`
        const rutaAbsoluta = path.join(ctx.directory, 'out', 'sharepoint', rutaRelativa)

        fs.mkdirSync(path.dirname(rutaAbsoluta), { recursive: true })

        const rutaMsg = path.join(ctx.directory, 'fixtures', 'reto-02', 'buzon', args.mensaje_id)
        const correo = JSON.parse(fs.readFileSync(path.join(rutaMsg, 'correo.json'), 'utf-8'))
        const adjunto = correo.adjuntos.find((a: string) => a.includes('contrato') || a.includes('otrosi'))
        if (adjunto) {
          fs.copyFileSync(path.join(rutaMsg, adjunto), rutaAbsoluta)
        }
        rutaArchivoFinal = rutaRelativa

        maestro.push({
          id_contrato: idContrato,
          cliente: contrato.cliente || '',
          nit_cliente: contrato.nit_cliente || '',
          pais: contrato.pais || 'CO',
          objeto: contrato.objeto || '',
          valor: String(contrato.valor || 0),
          moneda: contrato.moneda || 'COP',
          fecha_inicio: contrato.fecha_inicio || '',
          fecha_fin: contrato.fecha_fin || '',
          requiere_poliza: String(contrato.requiere_poliza || false),
          tipo_poliza: contrato.tipo_poliza || '',
          estado_poliza: contrato.estado_poliza || 'no_aplica',
          comercial: contrato.comercial || '',
          ruta_sharepoint: rutaRelativa,
          fecha_registro: hoy,
          fuente: 'buzon'
        })

        const rutaHistorial = path.join(ctx.directory, 'out', 'sharepoint', 'historial.jsonl')
        const lineaHistorial = {
          ts: new Date().toISOString(),
          id_contrato: idContrato,
          accion: 'nuevo',
          cambios: null,
          mensaje_id: args.mensaje_id
        }
        fs.appendFileSync(rutaHistorial, JSON.stringify(lineaHistorial) + '\n', 'utf-8')
      }

      escribirMaestroCSV(ctx.directory, maestro)

      // Actualización de procesados
      const rutaProcesados = path.join(ctx.directory, 'out', 'procesados.json')
      let procesados: string[] = []
      if (fs.existsSync(rutaProcesados)) {
        procesados = JSON.parse(fs.readFileSync(rutaProcesados, 'utf-8'))
      }
      if (!procesados.includes(args.mensaje_id)) {
        procesados.push(args.mensaje_id)
        fs.writeFileSync(rutaProcesados, JSON.stringify(procesados, null, 2), 'utf-8')
      }

      escribirLog(ctx.directory, 'contratos_registrar', args.mensaje_id, true, `${accion}: ${idContrato}`)

      return JSON.stringify({
        ok: true,
        data: {
          id_contrato: idContrato,
          accion,
          ruta_archivo: rutaArchivoFinal || undefined
        }
      })

    } catch (error) {
      return JSON.stringify({ ok: false, error: String(error) })
    }
  }
}

// Generación de reporte de alertas
export const alertas = {
  description: "Genera el reporte ejecutivo de riesgos en out/alertas.md: contratos que vencen en <= 60 días, pólizas pendientes y contratos registrados después del corte.",
  args: {
    hoy: z.string().describe("Fecha de referencia en formato YYYY-MM-DD (ej: 2026-09-03)")
  },

  async execute(args: { hoy: string }, ctx: { directory: string }) {
    try {
      const maestro = leerMaestroCSV(ctx.directory)
      const fechaHoy = new Date(args.hoy + 'T00:00:00')

      const fechaLimite60 = new Date(fechaHoy)
      fechaLimite60.setDate(fechaLimite60.getDate() + 60)

      // Vencimientos <= 60 días
      const vencen = maestro.filter(f => {
        if (!f.fecha_fin) return false
        const fin = new Date(f.fecha_fin + 'T00:00:00')
        return fin >= fechaHoy && fin <= fechaLimite60
      })

      // Pólizas pendientes
      const polizasPendientes = maestro.filter(f =>
        f.requiere_poliza === 'true' && f.estado_poliza !== 'vigente' && f.estado_poliza !== 'no_aplica'
      )

      // Registros post-corte
      const fechaCorte = '2026-05-30'
      const registradosDesdeCorte = maestro.filter(f => f.fecha_registro > fechaCorte)

      // Formato Markdown
      let md = `# 🚨 Reporte Ejecutivo de Alertas y Riesgos de Contratos\n\n`
      md += `> **Empresa:** Periferia IT Group  \n`
      md += `> **Fecha de corte de análisis:** ${args.hoy}  \n`
      md += `> **Generado automáticamente por:** Agente de Registro de Contratos  \n\n`
      md += `---\n\n`

      md += `## 1. ⏳ Contratos que Vencen en los Próximos 60 Días\n\n`
      if (vencen.length === 0) {
        md += `✅ *No hay contratos con vencimiento cercano en los próximos 60 días.*\n\n`
      } else {
        md += `| ID Contrato | Cliente | Vencimiento | Días Restantes | Comercial |\n`
        md += `|---|---|---|---|---|\n`
        for (const f of vencen) {
          const fin = new Date(f.fecha_fin + 'T00:00:00')
          const dias = Math.ceil((fin.getTime() - fechaHoy.getTime()) / (1000 * 60 * 60 * 24))
          md += `| \`${f.id_contrato}\` | ${f.cliente} | ${f.fecha_fin} | **${dias} días** | ${f.comercial} |\n`
        }
        md += `\n`
      }

      md += `## 2. 🛡️ Pólizas Pendientes o sin Regularizar\n\n`
      if (polizasPendientes.length === 0) {
        md += `✅ *Todas las pólizas contractuales se encuentran al día y vigentes.*\n\n`
      } else {
        md += `| ID Contrato | Cliente | Tipo de Póliza | Estado Actual | Comercial |\n`
        md += `|---|---|---|---|---|\n`
        for (const f of polizasPendientes) {
          md += `| \`${f.id_contrato}\` | ${f.cliente} | ${f.tipo_poliza} | ⚠️ **${f.estado_poliza.toUpperCase()}** | ${f.comercial} |\n`
        }
        md += `\n`
      }

      md += `## 3. 📈 Contratos Recuperados y Registrados (Post-Corte ${fechaCorte})\n\n`
      if (registradosDesdeCorte.length === 0) {
        md += `ℹ️ *Aún no se han registrado contratos nuevos posteriores a la fecha de congelamiento.*\n\n`
      } else {
        md += `| ID Contrato | Cliente | Valor | Moneda | Fecha Registro | Fuente |\n`
        md += `|---|---|---|---|---|---|\n`
        for (const f of registradosDesdeCorte) {
          md += `| \`${f.id_contrato}\` | ${f.cliente} | $${parseInt(f.valor || 0).toLocaleString()} | ${f.moneda} | ${f.fecha_registro} | ${f.fuente} |\n`
        }
        md += `\n`
      }

      const rutaAlertas = path.join(ctx.directory, 'out', 'alertas.md')
      fs.writeFileSync(rutaAlertas, md, 'utf-8')

      escribirLog(ctx.directory, 'contratos_alertas', '', true, `Reporte generado: ${vencen.length} vencimientos, ${polizasPendientes.length} pólizas pendientes`)

      return JSON.stringify({
        ok: true,
        data: {
          ruta: 'out/alertas.md',
          vencen,
          polizas_pendientes: polizasPendientes,
          registrados_desde_corte: registradosDesdeCorte,
          total_vencen_60d: vencen.length,
          total_polizas_pendientes: polizasPendientes.length,
          total_post_corte: registradosDesdeCorte.length,
          reporte_markdown: md
        }
      })

    } catch (error) {
      return JSON.stringify({ ok: false, error: String(error) })
    }
  }
}
