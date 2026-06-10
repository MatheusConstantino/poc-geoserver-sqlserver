# GeoServer — Setup e Bug Fix do BBox

**Sprint**: 2
**Spec**: `specs/01-technical-spec.md` (seção GeoServer)
**ADR**: `docs/adr/002-geoserver-vs-api-direta.md`

---

## Visão Geral

O GeoServer 2.25 é configurado com um workspace `poc-geoserver` apontando para o SQL Server 2022
via JDBC. Ao subir o stack com `docker compose up`, o GeoServer já está pré-configurado com os
3 layers publicados: `postes` (POINT), `trechos` (LINESTRING) e `subestacoes` (POLYGON).

**Layer Preview**: http://localhost:8080/geoserver/web → Layer Preview

---

## Estrutura do data_dir

```
geoserver/data_dir/
├── global.xml                          # Configurações globais
├── logging.xml                         # Nível de log
└── workspaces/
    └── poc-geoserver/
        ├── workspace.xml               # Definição do workspace
        ├── namespace.xml               # Namespace URI
        └── sqlserver-datastore/
            ├── datastore.xml           # Conexão JDBC com SQL Server
            ├── postes/
            │   ├── featuretype.xml     # Metadados do layer POINT
            │   └── layer.xml
            ├── trechos/
            │   ├── featuretype.xml     # ← bbox fix aplicado aqui
            │   └── layer.xml
            └── subestacoes/
                ├── featuretype.xml     # ← bbox fix aplicado aqui
                └── layer.xml
```

---

## Bug: Bbox Inválido em LINESTRING e POLYGON com SQL Server JDBC

### Sintoma

Ao publicar layers de LINESTRING ou POLYGON usando o datastore SQL Server JDBC (`gt-jdbc-sqlserver`),
o Layer Preview do GeoServer exibe mapa vazio ou erro:

```
Could not render map: Error rendering coverage on the fast path
```

O GetCapabilities retorna `0,0,0,0` para o bounding box do layer:

```xml
<BoundingBox CRS="EPSG:4326" minx="0.0" miny="0.0" maxx="0.0" maxy="0.0"/>
```

O WFS GetFeature funciona corretamente — os dados estão no banco, apenas o metadado de bbox está errado.

### Causa Raiz

O plugin JDBC do GeoServer tenta descobrir o bounding box nativo de cada layer consultando a view
`geometry_columns` do banco. O SQL Server **não popula** essa view automaticamente para colunas do
tipo `geometry` — ela fica vazia. O GeoServer interpreta isso como bbox `0,0,0,0`.

O problema afeta **apenas LINESTRING e POLYGON**. Para POINT, o plugin usa uma query diferente
(`SELECT TOP 1 geom.STEnvelope()`) que funciona corretamente.

### Workaround Aplicado

Declarar o `nativeBoundingBox` explicitamente no `featuretype.xml` de cada layer não-POINT:

```xml
<!-- trechos/featuretype.xml e subestacoes/featuretype.xml -->
<nativeBoundingBox>
  <minx>-54.6</minx>
  <maxx>-48.0</maxx>
  <miny>-26.7</miny>
  <maxy>-22.5</maxy>
  <crs>EPSG:4326</crs>
</nativeBoundingBox>
<latLonBoundingBox>
  <minx>-54.6</minx>
  <maxx>-48.0</maxx>
  <miny>-26.7</miny>
  <maxy>-22.5</maxy>
  <crs>EPSG:4326</crs>
</latLonBoundingBox>
```

Os valores correspondem ao extent do estado do Paraná (bounding box do dataset sintético).

### Por Que Não Resolver via UI?

Seria possível corrigir manualmente via GeoServer Admin → Layer → Edit → Compute from data.
Porém, esse click seria perdido a cada `docker compose down -v` (o data_dir é recriado do zero).

Ao commitar o `featuretype.xml` com o bbox explícito, a correção é **permanente e reproduzível**
— qualquer pessoa que clonar o repo e rodar `docker compose up` terá os layers funcionando.

### Layers Afetados

| Layer | Tipo | Bug Presente | Fix Aplicado |
|-------|------|-------------|-------------|
| postes | POINT | Não | N/A |
| trechos | LINESTRING | **Sim** | bbox explícito em featuretype.xml |
| subestacoes | POLYGON | **Sim** | bbox explícito em featuretype.xml |

---

## Verificação

Após `docker compose up`, verificar via WMS:

```bash
# Deve retornar uma imagem PNG com os trechos renderizados (não mapa vazio)
curl -o /tmp/trechos.png \
  "http://localhost:8080/geoserver/poc-geoserver/wms?\
SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap\
&LAYERS=poc-geoserver:trechos\
&BBOX=-54.6,-26.7,-48.0,-22.5\
&WIDTH=800&HEIGHT=600\
&SRS=EPSG:4326\
&FORMAT=image/png"

# Verificar que o arquivo tem tamanho razoável (> 5kb = tem dados)
ls -lh /tmp/trechos.png
```

Via WFS (verifica que os dados chegam independente do bbox):

```bash
curl -s "http://localhost:8080/geoserver/poc-geoserver/wfs?\
SERVICE=WFS&REQUEST=GetFeature\
&TypeName=poc-geoserver:postes\
&maxFeatures=1\
&outputFormat=application/json" | head -c 300
```

---

## Endpoints WMS / WFS

| Layer | WMS GetMap | WFS GetFeature |
|-------|-----------|----------------|
| postes | `poc-geoserver:postes` | `poc-geoserver:postes` |
| trechos | `poc-geoserver:trechos` | `poc-geoserver:trechos` |
| subestacoes | `poc-geoserver:subestacoes` | `poc-geoserver:subestacoes` |

GetCapabilities: http://localhost:8080/geoserver/poc-geoserver/wms?SERVICE=WMS&REQUEST=GetCapabilities
