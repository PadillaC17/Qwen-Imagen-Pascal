# Diseño técnico: Qwen Imagen Pascal

## Perfil Pascal VAE (predeterminado)

- backend híbrido: `all=cpu,diffusion=CUDA0,vae=CUDA0`
- atención: `--diffusion-fa`
- pesos: `--offload-to-cpu`
- VAE: sin `--vae-conv-direct`
- VAE tiling: desactivado salvo que se seleccione el perfil Tiled

La separación mantiene Qwen3-VL en CPU/RAM y reserva CUDA para la difusión y el VAE.

## Perfiles

- `pascal-fast`: VAE clásico, sin tiles. Ganador en la GTX 1070 de prueba (~20 s a 512x512, 6 pasos).
- `pascal-direct`: activa `--vae-conv-direct`; en la GTX 1070 de prueba fue mucho más lento (~57 s).
- `pascal-tiled`: VAE clásico con tiles 32x32; útil como fallback de memoria, pero fue ~57 s en la prueba.

## Compatibilidad

SageAttention se excluye del runtime de la aplicación porque el build usado exige SM80+. GTX 10xx usa Pascal/SM6.x. Flash Attention sí se utilizó correctamente en la GTX 1070 observada.

## Modelos

No se redistribuyen pesos. Se esperan los mismos archivos de Qwen Imagen Studio dentro de `models/`.
