---
name: registro-contratos
description: Conocimiento del proceso de registro, validación y alertas de contratos vigentes para Periferia IT Group
---

# Conocimiento del proceso de registro de contratos

## Contexto del negocio

Periferia IT Group es una empresa de servicios de tecnología que opera en Colombia (CO), Ecuador (EC), Perú (PE), Panamá (PA) y Honduras (HN). Firma contratos de prestación de servicios con sus clientes.

## Identificadores tributarios por país

| País | Código | Identificador | Formato |
|------|--------|--------------|---------|
| Colombia | CO | NIT | Numérico, se quitan puntos y dígito de verificación |
| Ecuador | EC | RUC | 13 dígitos |
| Perú | PE | RUC | 11 dígitos, empieza con 10 o 20 |
| Panamá | PA | RUC | Variable |
| Honduras | HN | RTN | 14 dígitos |

## Tipos de documento

- **Contrato nuevo**: Primera vez que aparece ese número de contrato.
- **Otrosí**: Modificación a un contrato existente (cambia plazo, valor, u otras cláusulas).
- **Cotización**: NO es un contrato, debe rechazarse.

## Reglas de póliza

- Si el contrato menciona "garantías", "póliza", "seguros" → `requiere_poliza = true`.
- Tipos comunes: `cumplimiento`, `calidad`, `responsabilidad_civil`, `salarios_prestaciones`.
- Un contrato nuevo con póliza se registra con `estado_poliza = pendiente`.
- Si no menciona póliza → `requiere_poliza = false`, `estado_poliza = no_aplica`.

## Monedas

| País | Moneda | Código |
|------|--------|--------|
| Colombia | Peso colombiano | COP |
| Estados Unidos / Internacional | Dólar | USD |
| Perú | Sol | PEN |
| Panamá | Balboa | PAB |
| Honduras | Lempira | HNL |

## Formato del maestro CSV

Columnas: id_contrato, cliente, nit_cliente, pais, objeto, valor, moneda, fecha_inicio, fecha_fin, requiere_poliza, tipo_poliza, estado_poliza, comercial, ruta_sharepoint, fecha_registro, fuente
