# Qwen Imagen Pascal

Interfaz local en español para **Qwen Image 2.1 + Viggle Turbo**, adaptada especialmente a **NVIDIA GeForce GTX 1070 8 GB (Pascal / SM 6.1)**.

## Qué cambia frente a Qwen Imagen Studio

- **Flash Attention fijo** en CUDA.
- **SageAttention desactivado** porque el runtime utilizado exige SM80+ y la GTX 1070 es SM 6.1.
- **Automático = CPU texto + GPU imagen**:
  - Qwen3-VL → CPU/RAM
  - Qwen Image 2.1 → CUDA
  - VAE → CUDA
- **Pascal VAE** es el perfil predeterminado: VAE clásico, sin `--vae-conv-direct` y sin tiles.
- Perfil **Direct VAE** para comparar.
- Perfil **Tiled VAE** como alternativa para VRAM/resoluciones más exigentes.
- Conserva referencias, biblioteca local, semillas, lotes, transparencia y JSON de parámetros.

## Benchmark real GTX 1070

Prueba realizada a **512×512, 6 pasos**:

| Perfil | Tiempo observado |
|---|---:|
| Pascal VAE | ~20 s |
| Direct VAE | ~57 s |
| Tiled VAE | ~57 s |

Estos valores pertenecen al equipo de prueba y no son una garantía universal.

## Modelos

**Este repositorio no incluye los pesos de los modelos.**

Si ya utilizas Qwen Imagen Studio puedes reutilizar:

- `models/`
- `runtime-v0.2.1/`
- opcionalmente `runtime-cpu-v0.2.1/`
- opcionalmente `runtime-vulkan-v0.2.1/`
- opcionalmente `node/`

También puedes ejecutar:

`Vincular modelos existentes.cmd`

para crear enlaces locales hacia una instalación existente sin duplicar los archivos.

Archivos esperados, entre otros:

- `Qwen3VL-8B-Instruct-Q4_K_M.gguf`
- `mmproj-Qwen3VL-8B-Instruct-F16.gguf`
- Qwen Image 2.1 Q4_K / Viggle Turbo
- `qwen_image_2.1_vae_bf16.safetensors`

## Inicio rápido

1. Clona o descarga este repositorio.
2. Vincula o copia tus carpetas de modelos/runtime.
3. Ejecuta **`Iniciar Qwen Imagen Pascal.cmd`**.
4. Abre `http://127.0.0.1:7871`.
5. Usa:
   - **Pascal automático**
   - **Pascal VAE · RÁPIDO**
   - **512×512**
   - **6 pasos**

## Resoluciones

El perfil rápido fue validado principalmente a **512×512**. En resoluciones rectangulares o más altas pueden aparecer artefactos dependiendo del runtime, del VAE y de la memoria disponible. Usa los perfiles alternativos si necesitas experimentar.

## Instaladores opcionales

Los scripts marcados como **OPCIONAL** se conservan para quien empiece desde cero. Si ya tienes los modelos y runtimes, no es necesario ejecutarlos.

## Créditos

Basado en ideas y componentes de:

- `jceronch1/qwen-imagen-studio`
- `stable-diffusion.cpp`
- Qwen Image 2.1
- Viggle Turbo

Los pesos de los modelos pertenecen a sus respectivos autores y **no se incluyen en este repositorio**.

## Licencia

Consulta `LICENSE` y las licencias individuales de cada modelo antes de redistribuir pesos.
