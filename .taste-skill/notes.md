# Dirección para el formulario de Gara Facile

Dirección sorteada: The product performs, seed 1632057300. Sin nuevos sorteos.

El usuario pidió una interfaz de formulario dentro de una aplicación. La propia skill excluye las pantallas de aplicación de su alcance normal; se usa por petición explícita, adaptando sus recomendaciones de marketing al registro de empresas.

Inventario: nombre Gara Facile; licitaciones TED; sede en la UE; cobertura geográfica distinta de la sede; servicios descritos sin códigos CPV; capacidad de ejecución; posibilidad de no tener experiencia; documentos de contexto y legales; perfil aprobado por el usuario; documentos en disco más adelante; ausencia deliberada de backend.

Argumento: identificar la empresa mediante datos concretos; definir su capacidad mediante cobertura y ejemplos; permitir documentos sin bloquear el registro; revisar todo antes de confirmar. El resumen lateral prueba que los datos del formulario tienen un destino comprensible.

Idea: En esta pantalla, la información necesaria para comparar una empresa con licitaciones se convierte en un perfil que se completa en directo. La interacción principal es rellenar el formulario y ver su resumen, no una simulación de resultados de matching.

Copy deck: “Tu empresa, bien definida.” / “Empecemos por tu empresa” / “Lo que puedes asumir” / “Un poco más de contexto” / “Revisa tu perfil”. Acciones: Continuar, Revisar perfil, Confirmar perfil. Los documentos son opcionales y los datos se borran al recargar.

Se conservan la familia Jost, el fondo blanco, tinta azul marino, superficies planas y acento naranja. Se adapta la composición a navegación de secciones, formulario y resumen. No se añaden fotografías, vídeo, titulares gigantes ni animaciones de marketing a un formulario. Las etiquetas secundarias de 14 px y el breadcrumb mantienen convenciones de aplicación.

Contenido ficticio: Voltio Instalaciones y todos los datos del botón Cargar ejemplo. No se presentan como cliente real. Sin imágenes externas ni licencias que atribuir.

## Round 1

Seen in one second: formulario con resumen del perfil.
Idea: convertir los datos de la empresa en un perfil revisable.
Live thing: resumen actualizado a medida que se escribe.
Layout words by section: navegación lateral / formulario / resumen lateral; en móvil, navegación superior y resumen debajo.
Scores: design 6.5 · usability 8 · creativity 6.5 · content 8 → overall 7.1.
Caps applied: el baremo de marketing limita la puntuación por ausencia de fotografías. No se añaden para subir artificialmente la puntuación de una pantalla de aplicación.
Top three problems:
1. Contraste 4.3:1 del texto vacío en el resumen, desktop/tablet/mobile. Corregido a la tinta secundaria con contraste superior a 4.5:1.
2. Autofoco inicial desplazaba el encabezado en desarrollo con Strict Mode. Corregido: enfocar solo al cambiar realmente de sección.
3. Los errores nuevos podían recibir foco antes de renderizar. Corregido: efecto que enfoca el primer campo inválido después del render.

El inspector sin excepciones marca reglas de marketing que no aplican al brief: fotografías, vídeo, animación abundante, titular dominante, tamaño de notas secundarias y breadcrumb interpretado como eyebrow. Estas excepciones se declaran en la ejecución final; no se afirma que el formulario pase el baremo de una landing page.

## Round 2

Seen in one second: formulario de empresa, con acción naranja y perfil lateral.
Idea: la misma, con cobertura desconocida hasta que el usuario la elige explícitamente.
Live thing: formulario, resumen y revisión funcionales; ejemplo ficticio opcional.
Layout words by section: navegación lateral / formulario / resumen; navegación horizontal en móvil.
Scores: design 6.5 · usability 8 · creativity 6.5 · content 8 → overall 7.1.
Caps applied: se mantiene el límite de fotografías de la rúbrica de marketing. Esta pantalla prioriza completar el formulario.
Top three problems: corregidos los tres de Round 1. Sin desbordamiento horizontal en 1440, 768 y 390 px. La vista móvil tiene más desplazamiento porque el resumen pasa debajo del formulario; no oculta campos ni acciones.

Inspector final: 0 FAIL, 0 WARN con excepciones explícitas few-pictures,no-footage,focal-point,still-page,eyebrow,body-size,grey-body. Lint visual de fuentes: 0 FAIL, 0 WARN. Capturas finales revisadas en /tmp/gara-facile-inspect-final. Se probaron errores obligatorios, cobertura internacional sin países, selección de país, empresa sin experiencia, rechazo de extensión no permitida, arrastre de un archivo de prueba, revisión y confirmación local sin solicitudes fetch.
