// Demo determinista sin LLM
import fs from 'fs'
import path from 'path'
import { leer_buzon, extraer, validar, registrar, alertas } from './src/tools/contratos.ts'

async function ejecutarDemo() {
  console.log('='.repeat(75))
  console.log('INICIANDO DEMO DETERMINISTA DE REGISTRO DE CONTRATOS — PERIFERIA IT')
  console.log('='.repeat(75))

  const ctx = { directory: process.cwd() }

  // Limpieza inicial
  console.log('\n[Paso 0] Limpiando carpeta out/...')
  const outDir = path.join(ctx.directory, 'out')
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
  console.log('  ✔ Carpeta out/ reseteada.\n')

  // Lectura del buzón
  console.log('[Paso 1] Ejecutando contratos_leer_buzon...')
  const resBuzon = JSON.parse(await leer_buzon.execute({}, ctx))
  if (!resBuzon.ok) {
    console.error('Error al leer buzón:', resBuzon.error)
    return
  }

  const mensajes = resBuzon.data.mensajes
  console.log(`  ✔ Se encontraron ${mensajes.length} mensajes pendientes en el buzón.\n`)

  let msg006Contrato: any = null

  // Primera pasada
  console.log('[Paso 2] Primera pasada: Extracción, Validación y Registro condicional...\n')

  for (const m of mensajes) {
    console.log('-'.repeat(70))
    console.log(`Mensaje: ${m.id} | Asunto: "${m.asunto}"`)

    if (!m.tiene_contrato) {
      console.log('   Acción: RECHAZADO (No adjunta contrato válido)')
      continue
    }

    const resExt = JSON.parse(await extraer.execute({ mensaje_id: m.id }, ctx))
    if (!resExt.ok) {
      console.log(`   Error al extraer: ${resExt.error}`)
      continue
    }
    const contrato = resExt.data

    const resVal = JSON.parse(await validar.execute({ mensaje_id: m.id, contrato }, ctx))
    const val = resVal.data

    console.log(`   Clasificación: [${val.clasificacion.toUpperCase()}]`)
    if (val.id_contrato_existente) {
      console.log(`   Contrato en maestro: ${val.id_contrato_existente}`)
    }
    if (val.diferencias) {
      console.log('   Diferencias detectadas:', JSON.stringify(val.diferencias))
    }
    if (val.requiere_revision.length > 0) {
      console.log(`   ⚠ Requiere revisión en: [${val.requiere_revision.join(', ')}]`)
    }

    if (val.clasificacion === 'duplicado') {
      console.log('   Acción: DUPLICADO (Sin cambios en el maestro)')
    } else if (val.requiere_revision.length > 0) {
      const resRegNo = JSON.parse(await registrar.execute({ mensaje_id: m.id, contrato, confirmado: false }, ctx))
      console.log(`   Acción tomada: QUEDA SIN REGISTRAR (${resRegNo.error})`)
      if (m.id === 'msg-006') {
        msg006Contrato = contrato
      }
    } else {
      const resReg = JSON.parse(await registrar.execute({ mensaje_id: m.id, contrato }, ctx))
      if (resReg.ok) {
        console.log(`   Acción tomada: REGISTRADO CON ÉXITO (${resReg.data.accion}) -> ${resReg.data.id_contrato}`)
        if (resReg.data.ruta_archivo) console.log(`   Archivado en SharePoint: out/sharepoint/${resReg.data.ruta_archivo}`)
      }
    }
  }

  // Segunda pasada con confirmación
  console.log('\n' + '='.repeat(75))
  console.log('[Paso 3] Segunda pasada: Confirmación explícita para msg-006...')
  console.log('='.repeat(75))

  if (msg006Contrato) {
    console.log('Analista confirma: "Confirmo el valor 0 y la fecha fin estimada de CM-2026-03"')
    const resRegConfirmado = JSON.parse(await registrar.execute({
      mensaje_id: 'msg-006',
      contrato: msg006Contrato,
      confirmado: true
    }, ctx))

    if (resRegConfirmado.ok) {
      console.log(`✔ Resultado: REGISTRADO CON ÉXITO tras confirmación humana -> ${resRegConfirmado.data.id_contrato}`)
      console.log(`  Archivado en: out/sharepoint/${resRegConfirmado.data.ruta_archivo}`)
    } else {
      console.log('❌ Error inesperado:', resRegConfirmado.error)
    }
  }

  // Generación de alertas
  console.log('\n' + '='.repeat(75))
  console.log('[Paso 4] Generando reporte ejecutivo de alertas (fecha referencia: 2026-09-03)...')
  console.log('='.repeat(75))

  const resAlertas = JSON.parse(await alertas.execute({ hoy: '2026-09-03' }, ctx))
  if (resAlertas.ok) {
    console.log(`✔ Reporte generado en: ${resAlertas.data.ruta}`)
    console.log(`  - Contratos que vencen en <= 60 días: ${resAlertas.data.total_vencen_60d}`)
    console.log(`  - Pólizas pendientes: ${resAlertas.data.total_polizas_pendientes}`)
    console.log(`  - Contratos recuperados post-corte: ${resAlertas.data.total_post_corte}`)
  }

  console.log('\n' + '*'.repeat(75))
  console.log('DEMO COMPLETADA EXITOSAMENTE SIN ERRORES')
  console.log('*'.repeat(75) + '\n')
}

ejecutarDemo()
