# Estudio de Uñas — Sistema de citas en línea

## Historial de versiones

**v6**
- El mensaje de recordatorio por WhatsApp ahora incluye un **enlace** en vez
  del código suelto (WhatsApp lo muestra automáticamente en azul y
  subrayado, listo para tocar). Ese enlace abre `index.html` directo en la
  sección "Cancelar mi cita" con el código ya escrito — el cliente solo
  tiene que poner su teléfono.
- Se quitó el enlace "Administración" de la página de clientes (seguía
  siendo accesible entrando directo a `admin.html`, pero ya no aparece a la
  vista en la página pública).
- El nombre del negocio configurado en "Horario" ahora también se refleja
  en el título de la pestaña del navegador (antes solo cambiaba el texto
  visible en pantalla).

**v5**
- Se quitaron los emojis (👋 ✨) del mensaje de recordatorio por WhatsApp,
  porque se mostraban como un cuadro/símbolo roto (problema de codificación
  de caracteres, no de WhatsApp). El mensaje queda en texto plano.

**v4**
- El mensaje de recordatorio por WhatsApp (botón "Recordatorio WhatsApp" en
  el panel admin) ahora incluye al final el **código de cancelación** de la
  cita, por si el cliente no lo copió al momento de reservar. Así siempre
  tiene una forma de recuperarlo.

**v3**
- Nuevo: los clientes ahora pueden **cancelar su propia cita** desde
  `index.html` (enlace "Cancelar mi cita" en la barra superior). Al reservar,
  se les entrega un **código de cancelación único** (el ID interno de la
  cita) que deben guardar; para cancelar, ingresan ese código junto con el
  número de teléfono que usaron al reservar.
  - Se actualizó `firestore.rules`: ahora cualquiera puede *leer una cita
    puntual si ya conoce su ID exacto* (`allow get`), pero **nadie sin
    sesión de administrador puede listar todas las citas** (`allow list`
    sigue restringido). Así, un desconocido no puede ver ni buscar citas
    ajenas — solo quien tiene el código exacto entregado al cliente. También
    se permite actualizar una cita sin sesión *solo* si el único cambio es
    poner `status: "cancelled"`.
  - IMPORTANTE: debes volver a pegar el contenido de `firestore.rules` en la
    consola de Firebase (Firestore Database → Reglas → Publicar) para que
    esta función funcione; el archivo cambió respecto a v1/v2.
- Nuevo: en el panel de administrador (pestaña "Citas") hay un botón
  **"Recordatorio WhatsApp"** por cada cita. Al hacer clic, abre WhatsApp
  (web o app) con un mensaje de recordatorio ya redactado, listo para
  enviar al número del cliente — tú decides cuándo darle clic (por ejemplo,
  la mañana del día de la cita). También se agregó un filtro "Mostrar solo
  las citas de hoy" para encontrar rápido a quién recordarle.
  - Esto NO es automático: requiere que abras el panel admin y hagas clic
    tú mismo. Un envío 100% automático (sin que tú intervengas) requeriría
    contratar un servicio de mensajería como Twilio y configurar un backend
    con tareas programadas — con costo y configuración adicional.

**v2**
- Corregido: el cuadro "Confirma tu cita" (modal) aparecía abierto apenas se
  cargaba la página de clientes, impidiendo elegir servicio y horario. Causa:
  en `css/style.css`, la regla `.modal-backdrop { display: flex; }` tenía más
  prioridad que el atributo `hidden` del HTML. Se agregó la regla
  `.modal-backdrop[hidden] { display: none; }` para que el atributo `hidden`
  vuelva a ocultarlo correctamente.

**v1**
- Versión inicial del proyecto.


Página para reservar citas de manicure/pedicure. Los clientes ven un calendario
con los días y horas disponibles según el servicio elegido; el administrador
tiene un panel aparte para añadir, editar o eliminar servicios (con su precio
y duración), configurar el horario de atención, y ver/cancelar las citas
agendadas.

## Cómo funciona (arquitectura)

Este proyecto son solo archivos estáticos (HTML/CSS/JS), lo que permite
alojarlo gratis en **GitHub Pages**. Pero como el administrador y los
clientes deben ver la misma información desde dispositivos distintos, los
datos (servicios, horario, citas) se guardan en **Firebase Firestore**, una
base de datos gratuita en la nube de Google. La autenticación del panel de
administrador usa **Firebase Authentication**.

En resumen:
- `index.html` + `js/client.js` → página pública de reservas.
- `admin.html` + `js/admin.js` → panel de administración (requiere iniciar sesión).
- Ambas leen y escriben en el mismo proyecto de Firebase, así que lo que
  configure el administrador se ve al instante en la página de clientes,
  sin importar el dispositivo.

Los datos personales de los clientes (nombre y teléfono) **solo pueden
leerse desde el panel de administrador autenticado**; la página pública
únicamente puede ver qué horarios ya están ocupados (fecha/hora), nunca
quién los reservó.

## Paso 1 — Crear el proyecto de Firebase (gratis)

1. Ve a [https://console.firebase.google.com](https://console.firebase.google.com) e inicia sesión con una cuenta de Google.
2. Clic en **"Agregar proyecto"**, ponle un nombre (ej: `estudio-de-unas`) y sigue los pasos (puedes desactivar Google Analytics, no es necesario).
3. Dentro del proyecto, en la página principal, clic en el ícono **`</>`** ("Web") para registrar una app web.
4. Ponle un apodo (ej: `web`) y clic en **"Registrar app"**. NO actives Firebase Hosting (usaremos GitHub Pages).
5. Firebase te mostrará un bloque de código con un objeto `firebaseConfig`. Copia esos valores.
6. Abre el archivo `js/firebase-config.js` de este proyecto y reemplaza los valores de ejemplo por los tuyos.

## Paso 2 — Activar Firestore Database

1. En el menú lateral de Firebase, ve a **Firestore Database** → **"Crear base de datos"**.
2. Elige la ubicación más cercana (ej: `southamerica-east1`) y modo **producción**.
3. Una vez creada, ve a la pestaña **"Reglas"** y reemplaza todo el contenido por el que está en el archivo `firestore.rules` de este proyecto. Clic en **"Publicar"**.

## Paso 3 — Activar Authentication y crear tu usuario admin

1. En el menú lateral, ve a **Authentication** → **"Comenzar"**.
2. En la pestaña **"Sign-in method"**, activa el proveedor **"Correo electrónico/contraseña"**.
3. Ve a la pestaña **"Users"** → **"Add user"** y crea tu usuario administrador (el correo y contraseña con los que vas a entrar a `admin.html`). Guarda esa contraseña en un lugar seguro; es la única puerta de entrada al panel.

No hay una pantalla de "registro" pública a propósito: el usuario admin se
crea una sola vez, manualmente, desde la consola de Firebase.

## Paso 4 — Probar en tu computador

Como el proyecto usa módulos de JavaScript (`type="module"`), no puedes
abrir `index.html` haciendo doble clic; el navegador bloquea los módulos si
no vienen de un servidor. Usa un servidor local simple, por ejemplo:

```bash
# Con Python (viene instalado en la mayoría de sistemas)
python3 -m http.server 8080
```

Luego abre `http://localhost:8080` en tu navegador. Entra primero a
`admin.html`, inicia sesión, ve a la pestaña **"Servicios"** y añade tu
primer servicio (nombre, precio y duración), y configura tu horario en la
pestaña **"Horario"**. Después abre `index.html` para probar la reserva
como cliente.

## Paso 5 — Subir el proyecto a GitHub y publicarlo con GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público; recuerda que tu
   `firebaseConfig` no es secreta — Firebase la protege con las reglas de
   Firestore, no ocultándola — así que es seguro subirla en un repo
   público).
2. Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Primer commit: sistema de citas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

3. En GitHub, ve a **Settings → Pages**.
4. En **"Source"**, elige **"Deploy from a branch"**, rama `main`, carpeta `/ (root)`, y guarda.
5. Espera 1–2 minutos; GitHub te dará una URL como
   `https://TU_USUARIO.github.io/TU_REPOSITORIO/`. Esa es tu página pública
   de reservas. El panel de administrador queda en
   `https://TU_USUARIO.github.io/TU_REPOSITORIO/admin.html`.

## Cómo usar el panel de administración

- **Servicios**: añade cada servicio con su nombre, precio (en pesos
  colombianos) y duración en minutos. La duración es clave: determina
  cuántos horarios se bloquean cuando alguien reserva ese servicio. Puedes
  editar, desactivar (para que no aparezca en la página pública sin
  borrarlo) o eliminar cualquier servicio.
- **Horario**: define las horas de apertura y cierre por día de la semana
  (o márcalo como "Cerrado"), el intervalo con el que se ofrecen horarios
  (cada 15/30/45/60 min), y fechas puntuales cerradas (festivos, vacaciones).
- **Citas**: aquí ves todas las citas agendadas con nombre y teléfono del
  cliente — esta información nunca aparece en la página pública. Puedes
  cancelar una cita, lo que libera de nuevo ese horario para que otro
  cliente lo reserve.

## Estructura de archivos

```
├── index.html          Página de reservas para clientes
├── admin.html           Panel de administración
├── css/style.css        Estilos de ambas páginas
├── js/
│   ├── firebase-config.js   Tus credenciales de Firebase (edítalo)
│   ├── firebase-init.js     Inicializa Firebase (no editar)
│   ├── utils.js              Funciones auxiliares (fechas, horas, formato)
│   ├── client.js              Lógica de la página de clientes
│   └── admin.js                Lógica del panel de administración
├── firestore.rules       Reglas de seguridad (pégalas en Firebase)
└── README.md
```

## Preguntas frecuentes

**¿Tiene algún costo?** No, mientras uses el plan gratuito de Firebase
("Spark"), que incluye una cuota generosa de lecturas/escrituras diarias
más que suficiente para un estudio de uñas. GitHub Pages también es gratis.

**¿Puedo cambiar los colores o el nombre del negocio?** El nombre del
negocio se cambia desde la pestaña "Horario" del panel admin. Los colores
y tipografías están en `css/style.css` si más adelante quieres ajustarlos.

**¿Puedo tener más de un administrador?** Sí, solo crea usuarios
adicionales en Firebase Authentication → Users.
