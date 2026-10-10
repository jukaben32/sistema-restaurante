# Guía de uso de Restaurant Martin

Esta guía está escrita para **cualquier persona**, aunque nunca haya usado un programa de computadora o de celular para trabajar. Cada explicación va **paso a paso**, con los nombres exactos de los botones tal como aparecen en pantalla.

**Cómo usar esta guía**

- Si eres **mesero**, lee las partes 1, 2, 3 y 4.
- Si eres **cocinero**, lee las partes 1, 2, 3 y 5.
- Si eres **administrador** (dueño o encargado), lee todo, empezando por las partes 1, 2 y 3, y luego la parte 6.
- Si solo quieres saber **qué hacer cuando algo falla**, ve directo a la parte 8.
- Las palabras que no entiendas están explicadas en el **Glosario** (parte 9).

> 💡 **Consejo:** no tengas miedo de tocar botones para aprender. Casi todas las acciones importantes (borrar, cancelar, cobrar) te piden una **confirmación** antes de hacerse, y puedes decir "Cancelar".

---

## 1. Antes de empezar: ideas básicas

### 1.1 ¿Qué es Restaurant Martin?
Es un programa que se usa **desde un navegador** (como cuando entras a Facebook o Google) y sirve para llevar todo el restaurante en un solo lugar:

- **Mesas y pedidos**: el mesero toma el pedido de cada mesa.
- **Cocina**: la cocina ve qué debe preparar, en orden.
- **Cobros y facturas**: se cobra en efectivo, tarjeta, transferencia o por internet, y se imprime la factura.
- **Delivery y para llevar**: pedidos a domicilio, con cobro y seguimiento.
- **Reservas** de mesas.
- **Inventario**: control de ingredientes y cuánto cuesta cada plato.
- **Ventas y reportes**: cuánto se vendió, qué se vendió más, a qué hora.
- **Menú digital con código QR**: el cliente pide desde su celular.
- **App para clientes** (instalable en el celular): los clientes ven el **plato del día**, piden **a domicilio o para recoger** y **pagan en línea**. Ideal para campañas de marketing (ver 6.6a).
- **Asistentes de inteligencia artificial**: uno contesta las **llamadas** y otro los mensajes de **WhatsApp** para tomar pedidos y reservas.

### 1.2 ¿Qué necesito para usarlo?
Un celular, tablet o computadora con **internet**, y estos tres datos que te da el administrador:

1. La **dirección web** del sistema (algo como `https://sistema-restaurante-peach.vercel.app`).
2. Tu **usuario**.
3. Tu **contraseña**.

### 1.3 Palabras que verás en esta guía
| Palabra | Qué significa |
|---|---|
| **Tocar / Pulsar / Hacer clic** | Presionar con el dedo (celular) o con el ratón (computadora). |
| **Botón** | Un rectángulo o círculo con texto o dibujo que puedes tocar para hacer algo. |
| **Menú** | La barra de arriba con los accesos a cada parte del sistema. En el celular se abre tocando el botón de **tres rayitas (☰)**. |
| **Pantalla emergente** | Una ventana pequeña que aparece encima para preguntarte algo o confirmar. |
| **Pedido** | Lo que pide un cliente (platos y bebidas). |
| **Factura** | El comprobante de lo que se cobró. |

---

## 2. Quién puede hacer qué: los roles

El sistema tiene **tres tipos de usuario**. Cada uno solo ve lo que necesita para su trabajo. Así se evitan errores y se protege la información del negocio.

| Rol | Es la persona que… | Qué puede hacer |
|---|---|---|
| **Administrador** | Es el dueño o encargado. | **Todo**: ver ventas, cambiar precios, crear usuarios, configurar el sistema, ver reportes, además de lo que hacen meseros y cocina. |
| **Mesero** | Atiende mesas, delivery y reservas. | Mesas y pedidos, cobrar y facturar, delivery, reservas, ver la cocina y marcar "entregado", leer las conversaciones de los asistentes. **No** ve ventas ni configuración, y **no** puede crear clientes al facturar. |
| **Cocinero** | Prepara la comida. | **Solo la pantalla de Cocina**: ver los pedidos, empezar a prepararlos, marcarlos como listos y cancelar lo que no se puede hacer. |

### Qué ve cada rol en el menú de arriba
| Opción del menú | Administrador | Mesero | Cocinero |
|---|:---:|:---:|:---:|
| Dashboard | ✅ | | |
| Venta rápida (inicio) | ✅ | | |
| Mesas | ✅ | ✅ | |
| Delivery | ✅ | ✅ | |
| Chats IA (Conversaciones) | ✅ | ✅ | |
| Cocina | ✅ | ✅ (solo ver y entregar) | ✅ |
| Ventas | ✅ | | |
| Reservas | ✅ | ✅ | |
| Productos | ✅ | | |
| Inventario | ✅ | | |
| Clientes | ✅ | | |
| Usuarios | ✅ | | |
| Ajustes (Configuración) | ✅ | | |
| Ayuda | ✅ | ✅ | ✅ |

> ⚠️ Si intentas entrar a una pantalla que no es de tu rol, el sistema te mostrará el mensaje **"No autorizado"**. No es un error: significa que esa parte es de otro rol.

---

## 3. Entrar y salir del sistema {roles=}

### 3.1 Iniciar sesión (entrar)
1. Abre el navegador (Chrome, Safari, Edge…) y escribe la **dirección web** del sistema, o toca el ícono de la app si ya la instalaste.
2. Verás la pantalla **"Iniciar sesión"**.
3. En **Usuario** escribe tu usuario (por ejemplo, `maria`). Cuida las mayúsculas y los espacios.
4. En **Contraseña** escribe tu clave.
5. Toca **Entrar**.

Según tu rol, el sistema te lleva a tu pantalla principal:
- **Administrador** → el **Dashboard**.
- **Mesero** → **Mesas**.
- **Cocinero** → **Cocina**.

> 💡 Si te equivocas, aparece el mensaje "Usuario o contraseña incorrectos". Revisa que no tengas activadas las mayúsculas y vuelve a intentar.

### 3.2 La primera vez que se instala el sistema
Si todavía no existe ningún usuario, el sistema te lleva solo a una pantalla llamada **"Crea el primer usuario"**. Allí el dueño escribe un **Usuario**, su **Nombre** (opcional), una **Contraseña** y la repite en **Confirmar contraseña**. Ese primer usuario siempre es **administrador**. Después de eso, esa pantalla desaparece.

### 3.3 Cerrar sesión (salir)
Cuando termines tu turno o dejes el teléfono a otra persona, **cierra tu sesión**:
- En la computadora: toca el botón con una flecha que sale de una puerta (🚪), arriba a la derecha.
- En el celular: toca **☰** y luego **Salir**.

> ⚠️ **Nunca dejes tu sesión abierta en un equipo compartido.** Todo lo que se haga quedará a tu nombre.

### 3.4 Olvidé mi contraseña
Pídele al **administrador** que te cambie la contraseña (ver parte 6.5). Por seguridad, nadie puede ver tu contraseña actual: solo se puede poner una nueva.

### 3.5 Usarlo cómodo en el celular
- **Gira el celular** (de lado) si necesitas ver más columnas en una tabla.
- Las tablas anchas se **deslizan con el dedo** hacia los lados.
- Tocando **☰** (arriba a la derecha) se abre el menú con todas tus opciones, con su nombre.

### 3.6 Instalar el sistema como una app (opcional pero recomendado)
Así tendrás un ícono en tu pantalla de inicio y se abrirá a pantalla completa, como cualquier otra app.

**En Android (Chrome):**
1. Entra al sistema.
2. Aparece abajo un aviso **"Instala Restaurant Martin…"**. Toca **Instalar**.
3. Si no aparece: toca los **tres puntitos** de Chrome (arriba a la derecha) y elige **"Instalar aplicación"** o **"Añadir a pantalla de inicio"**.

**En iPhone o iPad (Safari — debe ser Safari, no Chrome):**
1. Entra al sistema con **Safari**.
2. Toca el botón **Compartir** (un cuadrado con una flechita hacia arriba, abajo en el centro).
3. Desliza hacia abajo y toca **"Añadir a pantalla de inicio"**.
4. Toca **Añadir**. Aparecerá el ícono de **Martin POS**.

### 3.7 Atajos de teclado (solo computadora)
En algunas pantallas puedes ahorrar tiempo con estas teclas:

| Teclas | Dónde | Qué hacen |
|---|---|---|
| `Ctrl` + `B` (o `/`) | Venta rápida, Productos | Buscar producto |
| `Ctrl` + `F` | Venta rápida | Buscar cliente |
| `Ctrl` + `N` | Venta rápida, Productos | Nuevo cliente / nuevo producto |
| `Ctrl` + `S` | Venta rápida | Guardar pedido |
| `Ctrl` + `G` | Venta rápida | Generar factura |

(En Mac usa `Cmd` en lugar de `Ctrl`.)

---

## 4. Guía del MESERO {roles=mesero,administrador}

El mesero trabaja sobre todo en **Mesas**. Aquí tienes cada paso, desde que llega el cliente hasta que paga.

### 4.1 La pantalla "Mesas"
Al entrar verás una **tarjeta por cada mesa**. Cada tarjeta muestra:
- El **número de la mesa** y su descripción (por ejemplo, "Terraza").
- Una **etiqueta de color** con su estado:
  - 🟢 **libre**: no hay nadie.
  - 🟡 **ocupada**: tiene un pedido con platos.
  - ⚪ **reservada** o **bloqueada**: no se debe usar sin revisar.

> 💡 El sistema **se actualiza solo cada pocos segundos**. No necesitas recargar la página.

Cada tarjeta tiene estos botones:
| Botón | Para qué sirve |
|---|---|
| **Abrir / Continuar pedido** | Empezar el pedido de la mesa o seguir con el que ya tiene. |
| **Ver pedido** | Solo mirar lo que lleva la mesa. |
| **Liberar mesa** | Terminar con la mesa cuando el cliente se fue **sin pedir nada** o hay que cancelar el pedido. |
| **Editar** | Cambiar el número o la descripción de la mesa. |
| **Eliminar** | Borrar la mesa (solo si no tiene un pedido activo). |

Arriba a la derecha hay tres botones: **Reservas**, **QR menú** y **Nueva mesa**.

### 4.2 Crear, editar o eliminar una mesa
- **Crear:** toca **Nueva mesa**, escribe el **número** de mesa (por ejemplo, 5) y una **descripción** (opcional), y toca **Guardar**. Verás "Mesa creada".
- **Editar:** en la tarjeta toca **Editar**, cambia los datos y toca **Guardar**.
- **Eliminar:** toca **Eliminar** y confirma con **Sí, eliminar**. Si la mesa tiene un pedido activo, el botón está apagado y no se puede borrar.

### 4.3 Tomar un pedido (paso a paso)
1. Toca **Abrir / Continuar pedido** en la mesa del cliente. Se abre un panel a la derecha (en el celular ocupa toda la pantalla) que dice **"Pedido mesa N"**.
2. En **Buscar producto…** escribe parte del nombre o del código (por ejemplo, `pol` para "pollo"). Aparece una lista.
3. Toca el producto que quieres.
4. Aparece una ventana **"Cantidad para…"**: escribe cuántos y toca **Agregar al pedido**. (Los productos se piden por unidad. Si algún producto se vende por peso, el sistema te deja elegir **KG**, **LB** o **UND**.)
5. Si el plato tiene **opciones** (por ejemplo, un "Corriente" con *Goulash de cerdo*, *Crema* o *Ensalada*), el sistema te muestra una ventana **"Montar…"** para elegirlas. Lo que elijas **le llega a la cocina como nota**.
6. Si el cliente pidió algo especial (por ejemplo "sin cebolla"), escríbelo en **Nota para cocina (opcional)**.
7. Repite con cada plato. Verás la lista con **Producto, Cant, Precio, Subt** y el **Total** abajo.

> 💡 Mientras un plato esté **pendiente** (aún no enviado), puedes **editarlo** (cantidad o nota) o **eliminarlo**. Después de enviado ya no se edita: solo se puede **cancelar**.

### 4.4 Enviar el pedido a cocina
1. Cuando el cliente confirme todo, toca **Enviar a cocina**. Todos los platos pendientes pasan a la cocina.
2. También puedes enviar **un plato a la vez** con el botón de enviar de cada fila (útil cuando piden primero las bebidas).
3. Si no hay nada pendiente, el sistema avisa **"No hay items pendientes para enviar"**.
4. Si la cocina trabaja **sin pantalla**, el sistema imprime una **comanda** (papel para la cocina) y marca los platos como listos. Esto lo decide el administrador en Ajustes.

Cada plato en el panel muestra su estado:
| Estado | Significa |
|---|---|
| **pendiente** | Aún no se envió. |
| **enviado** | La cocina ya lo recibió. |
| **preparando** | La cocina lo está haciendo. |
| **listo** | Está listo para llevar a la mesa. |
| **servido** | Ya se entregó a la mesa. |
| **cancelado** / **rechazado** | Se canceló (no se cobra). |

### 4.5 Cancelar un plato ya enviado
1. En el panel del pedido, busca el plato y toca **cancelar**.
2. Confirma con **Sí, cancelar**. Aparece "Producto cancelado".
3. Si el plato se canceló o rechazó, puedes quitarlo de la lista con **Limpiar rechazados** (confirma con **Sí, limpiar**).

### 4.6 Servir y marcar "Entregado"
Cuando la cocina marque un plato como **listo**, te aparece en la pantalla **Cocina**, pestaña **Listos** (ver parte 4.10). Llévalo a la mesa y toca **Entregado** (o **Entregar mesa** para todos a la vez). Así el sistema sabe que ya se sirvió.

### 4.7 Pedidos que hace el propio cliente con el código QR
Si el restaurante usa el **menú digital por QR**, el cliente puede pedir desde su celular.
- El pedido llega a la mesa como **pendiente**, con la nota **"[Menú QR]"** (y el nombre del cliente si lo puso).
- Te sale un **aviso en pantalla** con sonido (ver 4.12).
- **Revísalo y toca Enviar a cocina** para confirmarlo. Si no lo envías, la cocina **no lo ve**. Esto evita errores.

### 4.8 Cobrar y facturar (cuando el cliente pide la cuenta)
1. Abre el pedido de la mesa y toca **Facturar**.
2. Aparece **"Seleccionar cliente"**. Busca al cliente escribiendo su nombre.
   - Si el cliente no está registrado, elige **Consumidor final** (venta sin datos).
   - Como **mesero no puedes crear clientes** en esta pantalla: el sistema lo avisa con *"Como mesero, no puedes crear clientes desde Facturar"*. Si hace falta uno nuevo, pídeselo al administrador (parte 6.4).
3. Toca **Usar cliente**.
4. Aparece **"Forma de pago"** con el **Total a pagar**. Elige cómo paga el cliente:
   - **Efectivo**, **Transferencia**, **Tarjeta** (datáfono), **QR**.
   - **Stripe (QR al cliente)**: aparece solo si el administrador activó Stripe. El cliente escanea un código y paga con su tarjeta o Apple Pay / Google Pay desde su celular (ver 4.9).
   - **Cripto — Bitcoin ⚡ (QR al cliente)**: aparece solo si el administrador activó los pagos con cripto. El cliente escanea un código con su billetera y paga con Bitcoin o Lightning (ver 4.9, parte "Cobrar con cripto").
5. Puedes **combinar medios**: toca **Agregar medio** y reparte el total (por ejemplo, la mitad en efectivo y la mitad con tarjeta). El sistema te muestra **Falta** o **Sobra** hasta que cuadre el total.
6. Si el cliente paga con un billete más grande, escribe el monto que **recibiste**; el sistema calcula y guarda solo lo cobrado (tú das el vuelto).
7. Toca **Confirmar pago**.
8. Se abre la **factura** lista para imprimir. La mesa queda **libre** automáticamente.

### 4.9 Cobrar con Stripe (tarjeta desde el celular del cliente)
1. En **Forma de pago** elige **Stripe (QR al cliente)**.
2. Aparece una ventana **"Cobrar con Stripe"** con el monto y un **código QR**.
3. El cliente abre la **cámara** de su celular, apunta al QR y paga con su tarjeta, Apple Pay o Google Pay.
4. La ventana te avisa sola cuando el pago se confirma ("Pago confirmado") y continúa con la factura.
5. Si el cliente se arrepiente, toca **Cancelar cobro**. Si ya había pagado justo en ese momento, el sistema lo detecta y respeta el pago.

> 💡 Un mismo pago de Stripe **no puede usarse dos veces**: el sistema lo impide.

#### Cobrar con cripto (Bitcoin o Lightning)
Funciona igual que Stripe, pero el cliente paga con una **billetera de criptomonedas** en su celular (por ejemplo Wallet of Satoshi, Muun, Phoenix o la de su exchange). El dinero llega **directo a tu billetera**, sin intermediarios.
1. En **Forma de pago** elige **Cripto — Bitcoin ⚡ (QR al cliente)**. Solo aparece si el administrador lo activó.
2. Se abre la ventana **"Cobrar con cripto"** con el monto y su equivalente aproximado en **BTC**.
3. Hay dos pestañas: **⚡ Lightning** (instantáneo, la mejor opción) y **₿ Bitcoin** (red normal de Bitcoin, puede tardar unos minutos). Muestra la que prefiera el cliente.
4. El cliente abre su billetera, **escanea el QR** y confirma el pago. Si no puede escanear, toca **Copiar** y se lo envías, o **Abrir página de pago**.
5. Cuando el pago llega, la ventana dice **"Pago confirmado"** y sigue con la factura. Si el pago de Bitcoin ya se vio pero falta confirmar, dice **"Pago detectado, confirmando…"**: espera.
6. Si el cliente se arrepiente, toca **Cancelar cobro**.

> 💡 Un mismo pago cripto **no puede usarse dos veces**. Si te piden **devolver** un pago cripto, se hace **a mano desde tu BTCPay**: el sistema no devuelve dinero solo.

### 4.9b Ver en qué va cada pedido (cocina en vivo)
No hace falta ir a preguntar a la cocina: la pantalla de **Mesas** te lo muestra sola y se actualiza cada pocos segundos.

**En cada mesa** aparecen etiquetas de colores:
| Etiqueta | Qué significa |
|---|---|
| ✏️ **Por enviar** (gris) | Lo anotaste pero aún no lo mandaste a cocina. |
| 📤 **En cola** (morado) | La cocina ya lo tiene, pero todavía no empieza. |
| 🔥 **Preparando** (amarillo) | La cocina lo está haciendo. |
| 🔔 **Listo** (verde) | ¡Ya está! Ve a recogerlo. La mesa se **resalta en verde**. |

Si una etiqueta de "en cola" o "preparando" se pone **roja**, ese pedido lleva demasiado tiempo: avisa en cocina (ver "Alertas de tiempo").

**Cuando un plato queda listo** te llega un **aviso verde arriba a la derecha** ("Mesa 5: 1 plato listo para servir") con un **sonido** y, en el celular, una **vibración**. Toca **Ver** para abrir el pedido de esa mesa. El aviso **no cierra** lo que estés haciendo (por ejemplo, un cobro).
> 💡 Para que suene, **toca la pantalla una vez** después de abrir Mesas (el navegador lo exige).

**Dentro del pedido** (Abrir / Continuar pedido):
- Arriba ves una **barra de avance** con cuántos platos van servidos, listos, preparándose o en cola.
- Cada plato muestra su **estado en color**. Los listos se ven con fondo verde.
- Cuando entregues a la mesa, toca el botón verde 📦 del plato, o **"Entregar N listos"** arriba para marcarlos todos de una vez.

### 4.10 La factura: imprimir y enviar por WhatsApp
En la pantalla de la factura verás:
- **Imprimir Factura**: abre la impresión de tu equipo (puede ser una impresora térmica).
- **WhatsApp**: abre WhatsApp con el resumen de la compra listo para enviar al cliente (si el cliente tiene teléfono registrado, ya va dirigido a él).
- **Volver**: regresa a Mesas.

### 4.11 Mover un pedido de mesa o liberar una mesa
- **Mover:** si el cliente cambia de mesa, abre su pedido y toca **Mover a otra mesa**. Elige la nueva mesa **libre** en **"Mover a mesa"**. Aparece "Pedido movido". Si no hay mesas libres, el sistema lo avisa.
- **Liberar:** toca **Liberar mesa** en la tarjeta y confirma con **Sí, liberar**. Úsalo si el pedido se canceló. Los platos se marcan como **rechazados** y la cocina los verá en su pestaña "Rechazados".

### 4.12 Los avisos con sonido
En **Mesas**, **Delivery** y **Dashboard** aparecen tarjetas oscuras abajo a la derecha con un pitido cuando pasa algo que necesita atención:
| Aviso | Qué pasó | Qué hacer |
|---|---|---|
| **Mesa N llama al mesero** | El cliente tocó "Llamar mesero" en su celular. | Ve a la mesa y toca **Atender**. |
| **Mesa N pide la cuenta** | El cliente quiere pagar. | Prepara la factura y toca **Atender**. |
| **Mesa N hizo un pedido desde el menú** | Pedido por QR. | Revísalo y envíalo a cocina. |
| **DEL-N nuevo pedido por confirmar** | Un pedido de delivery de un asistente. | Toca **Ver** y confírmalo en Delivery. |
| **Pago confirmado** | Un cliente pagó con Stripe. | Informativo. |
| **Envió un comprobante** | Un cliente mandó la foto de su transferencia. | Revisa el WhatsApp del restaurante y valida el pago. |
| **Pide hablar con una persona** | Un asistente necesita a un humano. | Abre **Conversaciones** y atiende. |
| **Nueva reserva por confirmar** | Reserva hecha por llamada, WhatsApp o web. | Ve a **Reservas** y confírmala. |

Toca **Atender** para que el aviso desaparezca.

### 4.13 Cocina (lo que ve el mesero)
En el menú, toca **Cocina**. El mesero **solo mira y entrega**. Las pestañas son:
- **Enviados**, **Preparando**, **Listos**: el avance de la cocina.
- **Entregados** y **Rechazados**: el historial.

Cuando algo está en **Listos**, toca **Entregado** (por plato) o **Entregar mesa** (todos los de esa mesa).

### 4.14 Delivery y pedidos para llevar
Toca **Delivery** en el menú. Es un tablero con **5 columnas**. Cada pedido es una tarjeta que va pasando de izquierda a derecha:

| Columna | Qué significa | Tu acción |
|---|---|---|
| **Por confirmar** | Pedido nuevo (de un cliente por llamada, WhatsApp o la **App de clientes**) que **tú debes revisar**. | **Confirmar** o **Rechazar**. Si el cliente de la app eligió pagar con **tarjeta o cripto**, el botón dice **"Esperando pago"** hasta que se vea **"Pagado"**: entonces puedes confirmar. |
| **En cocina** | Ya se envió a la cocina. | Esperar. Verás "X de Y platos listos". |
| **Listos** | La cocina terminó. | **Salió a entrega** o **Entregar**. |
| **En camino** | El repartidor salió. | **Entregado y cobrar**. |
| **Entregados hoy** | Pedidos terminados. | Ver la **Factura**. |

**Crear un pedido tú mismo (cliente que llamó o vino al local):**
1. Toca **Nuevo pedido**.
2. Elige **Delivery** (a domicilio) o **Para llevar** (el cliente lo recoge).
3. Escribe el **Teléfono / WhatsApp**. Si el cliente ya compró antes, el sistema **rellena solo** su nombre y dirección.
4. Completa **Nombre**, **Dirección de entrega**, **Referencia** (por ejemplo "frente al colmado") y elige la **Zona** (cada zona tiene su costo de envío).
5. En **Pago** elige **Efectivo al recibir**, **Transferencia**, **Tarjeta en línea (enlace Stripe)** o **Cripto — Bitcoin ⚡ (QR de pago)**.
6. En **Agregar platos** busca y agrega los productos. Puedes poner una nota por plato.
7. Abajo ves **Subtotal**, **Envío** y **Total**.
8. Deja marcado **Enviar directo a cocina** (si lo desmarcas, queda en "Por confirmar").
9. Toca **Crear pedido**.

**Cobrar un pedido de delivery:**
- **Efectivo:** al entregar, toca **Entregado y cobrar** y confirma **"Sí, entregar y facturar"** después de recibir el dinero.
- **Transferencia:** toca **Validar pago** cuando veas el dinero en tu cuenta. Sin ese paso el sistema no deja entregar.
- **Tarjeta en línea:** toca **Link de pago**. Te muestra un **QR y un enlace**: toca **Copiar enlace** o **Enviar por WhatsApp**. Cuando el cliente paga, la tarjeta muestra **"Pagado (Stripe)"**.
- **Cripto:** toca **Cobro cripto**. Te muestra un **QR y un enlace**: toca **Copiar enlace** o **Enviar por WhatsApp**. Cuando el cliente paga, la tarjeta muestra **"Pagado (cripto)"** y llega un aviso de **pago recibido**.
- Si aún no se definió el pago, el sistema te pregunta **Efectivo, Tarjeta (datáfono) o Transferencia** al entregar.

**Otras acciones:** **asignar repartidor** (nombre de quien lleva el pedido), llamar o escribir por WhatsApp al cliente con los íconos junto a su teléfono, y **Cancelar** un pedido (con motivo). Si el cliente ya había pagado con Stripe, el sistema te recuerda **hacer el reembolso en el panel de Stripe**.

> 💡 Al **confirmar**, salir a entrega y entregar, el cliente recibe un **mensaje automático por WhatsApp** (si WhatsApp está conectado), en español o en inglés según cómo escribió.

### 4.15 Reservas
Toca **Reservas** en el menú (o el botón **Reservas** en Mesas).
1. Arriba hay una **franja de 14 días**. Cada día muestra cuántas reservas y personas tiene. Toca un día para ver su lista, ordenada por hora.
2. Para anotar una reserva toca **Nueva reserva**, escribe **Nombre**, **Teléfono**, **Correo** (opcional), **Fecha y hora**, **Personas**, la **Mesa** (opcional) y **Notas** (cumpleaños, alergias…). Toca **Guardar**.
3. Si eliges una mesa que ya está reservada a menos de 2 horas, el sistema avisa y no deja duplicar.
4. Cada reserva tiene botones según su estado:
   - **Confirmar**: la reserva queda segura. El cliente recibe un WhatsApp de confirmación.
   - **Sentar**: el cliente llegó. Marca la mesa como libre para tomar el pedido.
   - **Completar**: ya terminó.
   - **No llegó**: el cliente no se presentó.
   - **Cancelar** / **Rechazar** / **Reabrir**.
5. El botón verde de **WhatsApp** abre el chat con el cliente con un mensaje listo.
6. El cliente puede reservar solo desde la página pública **/reservar** del restaurante: esas reservas llegan como **Por confirmar** con la etiqueta **Web**.

### 4.16 Conversaciones con los asistentes (llamadas y WhatsApp)
Toca **Chats IA** en el menú. Aquí ves todas las llamadas y chats que atienden los asistentes.
- A la izquierda, la lista. Las que dicen **"Necesita una persona"** (en rojo) van primero.
- Al tocar una, ves la conversación completa, con los pasos que hizo el asistente (por ejemplo "crearPedido"), el **resumen** de las llamadas y la **grabación**.
- **Tomar conversación**: pausa al asistente en ese chat para que **tú** respondas. Escribe en el cuadro de abajo y toca el botón de enviar.
- **Devolver al asistente**: vuelve a activarlo cuando termines.
- **Resuelta**: quita la marca de "necesita una persona".
- Si **tú escribes desde el teléfono del restaurante**, el asistente se pausa solo en ese chat.

---

## 5. Guía del COCINERO {roles=cocinero,administrador}

El cocinero usa una sola pantalla: **Cocina**.

### 5.1 La pantalla de Cocina
Arriba ves **contadores**: **Enviados**, **Preparando** y **Listos**. Debajo hay **pestañas**:

| Pestaña | Qué muestra |
|---|---|
| **Enviados** | Pedidos nuevos que aún **no has empezado**. |
| **Preparando** | Lo que **estás cocinando** ahora. |
| **Listos** | Lo que ya terminaste y espera al mesero. |
| **Entregados** | Historial de lo que ya se sirvió. |
| **Rechazados** | Historial de lo que se canceló. |

Cada tarjeta muestra la **mesa** (o **Delivery DEL-N** / **Para llevar LLEVAR-N** si es a domicilio), la **hora**, el **mesero**, los platos con su **cantidad** y las **notas** en destacado (por ejemplo "sin cebolla") — ¡léelas siempre!

**Colores de la hora:** si un pedido lleva mucho tiempo sin atenderse, su hora se pone **amarilla** y luego **roja** (y la tarjeta se resalta; abajo a la derecha sale "N pedidos con demora"). Si ves rojo, **atiéndelo primero**. El administrador puede cambiar los minutos (ver "Alertas de tiempo" en la parte 6).

### 5.2 Paso a paso: preparar un pedido
1. En **Enviados**, mira la tarjeta más antigua (los pedidos van **en orden de llegada**).
2. Toca **Preparar mesa** (o **Preparar pedido** si es delivery). Todos los platos pasan a **Preparando**.
3. Cuando termines **cada plato**, toca **Listo** en ese plato.
4. Cuando todo esté listo, el mesero lo ve en **Listos** y lo lleva.

### 5.3 Cancelar un plato
Si falta un ingrediente o no se puede hacer, toca **Cancelar** en ese plato y confirma con **Sí, cancelar**. Pasa a **Rechazados** y el mesero lo ve para avisar al cliente. Solo se puede cancelar mientras está en Enviados, Preparando o Listos.

### 5.4 Herramientas útiles
- **Auto**: actualiza la pantalla sola cada pocos segundos. Déjalo encendido.
- **Buscar por mesa, producto o nota…**: filtra las tarjetas.
- **Desde / Hasta**: en **Entregados** y **Rechazados**, para ver el historial de otro día.

> 💡 Los pedidos de **delivery** también aparecen aquí con un ícono de moto 🛵. Se trabajan igual que los de mesa.

> ⚠️ Un plato solo llega a Cocina cuando el mesero (o el personal en Delivery) lo **envió/confirmó**. Si falta algo, avisa al mesero.

---

## 6. Guía del ADMINISTRADOR {roles=administrador}

El administrador puede hacer todo lo que hacen el mesero y el cocinero (partes 4 y 5) y además **dirige el sistema**. Esta parte explica cada pantalla.

### 6.1 El Dashboard (tu tablero del día)
Es la pantalla de inicio. Se **actualiza sola cada 30 segundos** y te muestra, de un vistazo:

| Tarjeta | Qué te dice |
|---|---|
| **Ventas de hoy** (número grande) | Todo lo cobrado hoy, comparado con **ayer a esta misma hora** (verde = vas mejor, rojo = peor). |
| **Facturas** | Cuántas facturas se hicieron hoy. |
| **Ticket promedio** | Cuánto gasta en promedio cada cliente. |
| **Cobrado con Stripe hoy** | Lo cobrado por internet. |
| **Ventas de los últimos 7 días** | Barras por día. Pasa el dedo o el cursor sobre una barra para ver el detalle. El botón **Ver tabla** muestra los mismos datos en tabla. |
| **Más vendidos · 7 días** | Los platos que más dinero dejaron. |
| **Mesas** | Cuántas están ocupadas, libres o reservadas, y el porcentaje de ocupación. |
| **Cocina** | Cuántos platos hay por confirmar, en cola, preparando y listos. |
| **Reservas de hoy** | Las próximas, con hora y estado. |
| **Stock bajo** | Ingredientes que se están acabando. |
| **Cobrado hoy por medio de pago** | Efectivo, transferencia, tarjeta y QR. |
| **Delivery** | Pedidos por confirmar, en cocina, en camino y entregados hoy. |

### 6.2 Venta rápida (mostrador)
Es la pantalla de **Inicio** (ícono de casa). Sirve para vender **sin mesa**: un cliente que llega, pide y paga en el momento.
1. **Cliente:** en *Buscar cliente por nombre o teléfono…* escribe y elige. Si no existe, toca **Nuevo cliente**, llena **Nombre**, **Dirección**, **Teléfono** y guarda.
2. **Producto:** en *Buscar producto por nombre o código…* elige el plato. Escribe la **Cantidad**, elige la **Unidad** (**UND**, **KG** o **LB**) y revisa el **Precio**. Toca el botón **+ (Agregar producto)**.
3. Repite para cada producto. Abajo ves la tabla con **Producto, Cantidad, Unidad, Precio Unit., Subtotal, Acciones** y el **Total**.
4. Elige la **forma de pago**: **Efectivo**, **Transferencia**, **Tarjeta**, **QR**, **Stripe (QR al cliente)**, **Cripto — Bitcoin ⚡ (QR al cliente)** o **Pago mixto (varios medios)**.
5. Toca **Generar factura** (o `Ctrl+G`). Se abre la factura para imprimir.

**Guardar un pedido para después:** toca **Guardar pedido** (o `Ctrl+S`) para dejarlo en pausa, y **Ver pedidos guardados** para retomarlo.
> ⚠️ Los pedidos guardados se quedan **en ese equipo y navegador**. No los verás desde otro celular.

### 6.3 Productos (tu carta y precios)
Menú → **Productos**.

**Crear un producto**
1. Toca **Nuevo producto**.
2. **Código**: un identificador corto y único (por ejemplo `POL1`).
3. **Nombre**: el nombre del plato.
4. **Precio KG / Precio UND / Precio LB**: el precio según cómo se venda. Para un plato normal usa **Precio UND** y deja 0 en los otros dos.
5. Sección **Carta digital** (para el menú QR y los asistentes):
   - **Categoría**: por ejemplo *Entradas*, *Platos fuertes*, *Bebidas*, *Postres*. Sirve para ordenar la carta.
   - **Mostrar en el menú**: si está apagado, el cliente **no** lo ve ni los asistentes lo ofrecen.
   - **Disponible**: apágalo cuando se **agote**. Aparecerá como **Agotado** y nadie podrá pedirlo.
   - **⭐ Plato del día**: enciéndelo en los platos que quieras **destacar arriba** de la app de clientes ("Hoy en tu restaurante"). Puedes marcar uno o varios y cambiarlos cada día.
   - **Descripción**: ingredientes, porción, alérgenos.
   - **Foto**: JPG, PNG o WebP de hasta 3 MB. Toca la **✕** para quitarla.
6. Toca **Guardar**.

**Editar o borrar:** usa el lápiz ✏️ o la papelera 🗑️ de la fila. Si el producto ya tiene ventas, **no se puede borrar**: apágalo con **Mostrar en el menú** y **Disponible**.

**Opciones de un plato (los "hijos")**
Sirve para platos con variantes, por ejemplo un **Corriente** que viene con *Goulash de cerdo*, *Crema* o *Ensalada*.
1. En la fila del producto toca el ícono de **jerarquía** (Gestionar hijos).
2. En **Agregar ítem** escribe una opción (puedes poner varias separadas por coma) y toca **Agregar ítem**.
3. Las opciones aparecen en **Ítems configurados**. Al tomar un pedido, el mesero las elige y llegan a la cocina como nota.

**Cargar muchos productos con Excel**
1. Toca **Descargar plantilla** y ábrela en Excel.
2. Llénala (una fila por producto: código, nombre, precios) y guárdala.
3. Toca **Importar Excel** y elige el archivo. Si un código ya existe, **se actualiza** en lugar de duplicarse.

### 6.4 Clientes
Menú → **Clientes**. Es tu lista de personas que compran.
- **Nuevo cliente**: **Nombre**, **Dirección**, **Teléfono**. Toca **Guardar**.
- **Buscar cliente…**: filtra por nombre o teléfono.
- ✏️ **Editar** / 🗑️ **Eliminar**. Si el cliente tiene facturas, **no se puede eliminar** (el sistema avisa).
- El sistema también **crea clientes solo** cuando alguien pide por llamada o WhatsApp, y los reconoce después por su teléfono.
- Existe un cliente especial **"Consumidor final"** para ventas sin datos.

### 6.5 Usuarios y contraseñas
Menú → **Usuarios**. Aquí das acceso a tu equipo.

**Crear un usuario**
1. Toca **Nuevo usuario**.
2. **Usuario**: el nombre para entrar (ejemplo `juan`, sin espacios).
3. **Nombre**: su nombre completo (ejemplo *Juan Pérez*). Aparece en los pedidos como el mesero.
4. **Rol**: **administrador**, **mesero** o **cocinero**.
5. **Activo**: déjalo encendido.
6. **Contraseña**: una clave que él pueda recordar (anótala para dársela).
7. Toca **Guardar**.

**Otras acciones**
- **Editar**: cambia nombre, rol o estado. En la edición, deja la contraseña vacía si no quieres cambiarla.
- **Cambiar contraseña** (botón de la fila): escribe la **Nueva contraseña** y **Confirmar**.
- **Desactivar** a alguien que ya no trabaja: apaga **Activo** (es mejor que borrarlo, porque conserva el historial). Verás la etiqueta **Inactivo**.
- La tabla muestra también el **Último login** de cada persona.

> ⚠️ **Reglas de seguridad:** el sistema **no deja** que te quedes sin ningún administrador activo. Usa contraseñas largas y **cambia la inicial** (`admin123`) de inmediato. Da a cada persona **su propio usuario**: así sabes quién hizo qué.

### 6.6 Ventas (historial y reportes)
Menú → **Ventas**.
- **Filtros:** *Desde*, *Hasta* y *Buscar por cliente o # factura*. Sin fechas muestra todo.
- La tabla lista **Factura #, Fecha, Cliente, Forma de Pago, Total, Acciones**.
- **Ver detalles** (ojo): cliente, factura, productos, cantidades y pagos.
- **Reimprimir factura** (impresora).
- Arriba verás **totales por medio de pago** (efectivo, transferencia, tarjeta, QR) y **gráficos**: productos más vendidos, días con más movimiento y horas pico.
- **Exportar**: descarga un **archivo de Excel** con el detalle, listo para tu contador. Respeta los filtros de fecha.

### 6.6a App para clientes (pedidos desde el celular)
**Qué es:** una página que se **instala como una app** en el celular del cliente (sin tienda de aplicaciones). Con ella tus clientes **ven el menú y el plato del día, piden a domicilio o para recoger y pagan** con tarjeta, Apple Pay o Google Pay, criptomonedas, transferencia o efectivo. Es ideal para **campañas de marketing**: compartes un enlace o un QR y listo.

**Dónde está:** **Ajustes → App de clientes**. Allí encuentras:
- El **enlace de tu app** (con botón **Copiar**) y su **código QR** (con botón **Descargar QR**) para imprimir en volantes, mesas y empaques.
- El interruptor **"Recibir pedidos desde la app"**: si lo apagas, el menú se sigue viendo pero no se puede pedir (útil para pausar si estás muy lleno).
- Una lista **"Antes de lanzar tu campaña"** que te dice si tienes productos publicados, zonas de entrega y qué formas de pago están activas.

**Lo que debes dejar listo antes de compartirla:**
1. **Productos** con **Mostrar en el menú** encendido, buenas **fotos y descripciones**, y **Disponible** apagado en lo que se haya agotado.
2. **⭐ Plato del día** en los platos que quieras destacar.
3. **Horario, zonas de entrega con su costo y pedido mínimo** en **Ajustes → Delivery y agentes**. **Fuera de horario la app no recibe pedidos.**
4. **Formas de pago:** *Efectivo* siempre está. Para **transferencia** escribe tus datos bancarios en *Delivery y agentes*; para **tarjeta** activa *Pagos con Stripe*; para **cripto** activa *Pagos con cripto*.

**Cómo llega un pedido:** aparece en **Delivery** como **Por confirmar**, con un **aviso con sonido** y la etiqueta **App**. Si el cliente pagó en línea verás **"Pagado"** y puedes confirmar; si no ha pagado, el botón dice **"Esperando pago"**. Si no paga en **1 hora**, el pedido se cancela solo. El cliente sigue su pedido en la misma app (recibido → preparando → listo → en camino → entregado).

**Para medir tus campañas:** agrega una etiqueta al enlace, por ejemplo `.../pedir?utm_source=instagram`.

**Protecciones:** el cliente **no necesita cuenta** (solo nombre y teléfono); los **precios siempre salen del sistema**, nunca del celular del cliente; y hay límites contra pedidos falsos repetidos. Aun así, **tú confirmas cada pedido** antes de que pase a cocina, igual que con los asistentes.

> 💡 Si un cliente te dice que pagó y no ves "Pagado", espera unos segundos y refresca; si sigue igual, revisa tu panel de Stripe o BTCPay. Las **devoluciones** se hacen **a mano** desde Stripe o BTCPay.

### 6.6b Datos de demostración (para practicar)
Mientras el restaurante no abre, el sistema puede traer **datos de ejemplo del mercado dominicano** para que explores y practiques sin miedo: un **menú de unos 65 platos** (sándwiches, pizzas, pica pollo, asado de cerdo, mariscos, postres y bebidas con precios en RD$), **clientes**, **inventario en libras y kilos con recetas**, **ventas de las últimas 2 semanas**, **reservas**, **pedidos de delivery y para llevar** de varias zonas (Bávaro, Cap Cana, Verón…), **mesas ocupadas** y el **horario y preguntas frecuentes** del restaurante.
- Si están cargados, arriba de cada pantalla verás una **franja amarilla: "Datos de demostración"**.
- **Para quitarlos** (hazlo antes de abrir): toca **Quitar datos de demostración** en esa franja, escribe **QUITAR** y confirma. Se borra **solo lo de ejemplo**; lo que tú hayas creado **no se toca**. Las facturas, pedidos y demás vuelven a **empezar desde el número 1**.
- ⚠️ **Mientras estén cargados no registres ventas ni clientes reales**: se mezclarían con los de ejemplo. Primero quita los datos de demostración y después empieza a trabajar de verdad.
- Los teléfonos y los datos bancarios de ejemplo **no son reales** (empiezan con 809/829/849-555…). Cuando quites la demostración, escribe los tuyos en **Ajustes → Delivery y agentes**.

### 6.7 Inventario (ingredientes y costos)
Menú → **Inventario**. Tiene 3 pestañas.

**Insumos**
1. Toca **Nuevo insumo**: **Nombre** (carne de res), **Unidad** (**kg**, **lb**, und, l…; ver "Kilos o libras" más abajo), **Stock inicial**, **Stock mínimo** (cuando baje de ahí avisa) y **Costo por unidad**. Guarda.
2. En cada fila: ➕ **Entrada** (compraste), ➖ **Salida / merma** (se dañó o se perdió), 📋 **Ajuste por conteo** (contaste y hay otra cantidad), ✏️ editar y 🗑️ eliminar.
3. Las tarjetas de arriba muestran **cuántos insumos** tienes, cuántos están en **Stock bajo**, el **Valor del inventario** y el **Margen promedio**.

**Recetas y costeo**
1. En la fila de un plato toca **Receta**.
2. Con **Agregar insumo** indica **qué ingredientes** y **qué cantidad** usa **una unidad** del plato.
3. Abajo ves el **Costo**, el **Precio** y el **Margen** (qué porcentaje te queda de ganancia). 🟢 verde = buen margen, 🟡 amarillo = justo, 🔴 rojo = bajo.
4. **Magia:** cada vez que se **factura** un plato con receta, el sistema **descuenta solo** los ingredientes.

**Movimientos:** historial de cada entrada, salida, ajuste y venta, con fecha y quién lo hizo.

**Kilos o libras (tú eliges)**
Cada insumo se mide en **una** unidad: **kg** (kilos) o **lb** (libras), la que más uses. Puedes cambiarla cuando quieras y el sistema hace las cuentas por ti (**1 kg = 2,2046 lb**):
- **Cambiar un insumo de kg a lb (o al revés):** en su fila toca el botón **⇄ a lb** (o **⇄ a kg**). Te muestra cómo quedaría el stock y, si estás de acuerdo, toca **Sí, convertir**. Se convierten **solos** el **stock**, el **mínimo**, el **costo por unidad**, las **recetas** y el **historial**. El **costo de tus platos y los márgenes no cambian**: es el mismo producto, solo medido distinto.
- **Comprar en una unidad distinta a la del insumo:** al registrar una **Entrada** (o Salida / Ajuste) hay una casilla de unidad junto a la cantidad. Si el pollo está en kilos pero te lo vendieron en libras, escribe **22** y elige **lb**: el sistema lo convierte y suma lo que corresponde.
- **Recetas:** en cada ingrediente de una receta también puedes elegir la unidad. Si el insumo está en kilos pero tu receta usa **1 lb** de pollo por plato, escribe **1** y elige **lb**.
- También puedes cambiar la unidad desde **✏️ Editar**: escribe la nueva unidad (por ejemplo **lb**) y guarda; el sistema te pregunta si quieres convertir.
- **Otras unidades que se convierten:** **g** (gramos), **oz** (onzas), **l** (litros), **ml** y **gal** (galones). Los **pesos** se convierten entre sí y los **líquidos** entre sí; **no** se puede pasar de kilos a litros, ni de "und" a kilos.
> 💡 Si un insumo se mide en cajas, paquetes o unidades, cambiarle el nombre de la unidad **no** modifica las cantidades.
> 💡 Los **productos del menú** ya se pueden vender por **UND, KG o LB** (cada uno con su precio); eso es independiente de la unidad del inventario.

> 💡 El sistema **nunca bloquea una venta** por falta de stock; el insumo puede quedar en negativo y aparece en rojo para que lo corrijas.

### 6.8 Reservas (administración)
Funciona igual que en la parte 4.15. Como administrador, además puedes copiar el enlace público **/reservar** y compartirlo en redes sociales o WhatsApp para que los clientes reserven solos. Revisa a diario las que estén **Por confirmar**.

### 6.9 Ajustes (Configuración)
Menú → **Ajustes**. Arriba hay accesos: **Asistentes IA**, **Delivery y agentes**, **QR del menú**, **Pagos con Stripe**, **Pagos con cripto**, **App de clientes**, **Alertas de tiempo**, **Redes y pie**. Y abajo, 3 pestañas: **Negocio**, **Impresión** y **Red**.

#### A) Pestaña Negocio
Datos que salen en las facturas:
- **Nombre del Negocio**, **NIT / RUT** (tu identificación fiscal), **Dirección**, **Teléfono**.
- **Pie de Página**: el mensaje al final de cada factura (por ejemplo "¡Gracias por su visita!").
- **Logo del Negocio**: sube tu logo (aparece en facturas y reportes).
- **QR para Transferencias**: sube la imagen del código QR de tu banco para que el cliente transfiera escaneándolo.
- Toca **Guardar** al terminar.

#### B) Pestaña Impresión
- **Comanda** (el papel que va a cocina):
  - **Ancho del Papel**: 58 mm (pequeño) u 80 mm (estándar).
  - **Tamaño de Fuente**: Normal o Grande.
  - **Cocina sin pantalla**: si tu cocina **no tiene pantalla**, al enviar un pedido se imprime la comanda y los platos pasan directo a **listos**.
  - **Imprimir en servidor (PC)**: la comanda sale por la impresora de la computadora del local aunque el mesero use un celular. Elige la **impresora** de la lista.
- **Factura**:
  - **Imprimir en servidor**, **Impresión automática** (se abre el cuadro de impresión sola) y **Copias**.

> ⚠️ La opción de imprimir "en servidor (PC)" **solo funciona si el sistema corre en una computadora del local**. Si el sistema está en internet (Vercel), usa la impresión desde el navegador del equipo que tenga la impresora.

#### C) Pestaña Red
Muestra un **código QR con la dirección del sistema** para que meseros y cocina lo abran en sus celulares o tablets que estén conectados a la **misma red wifi**.

#### D) Pagos con Stripe
Permite cobrar con tarjeta desde el celular del cliente. El dinero va directo a **tu cuenta de Stripe**.
1. Crea una cuenta en **stripe.com** y entra a *Developers → API keys*.
2. Copia tu **llave secreta** (`sk_…`; para pruebas usa la que empieza con `sk_test_`).
3. En el sistema: **Ajustes → Pagos con Stripe**. Pega la **Llave secreta** (y la **Llave publicable** `pk_…`), elige la **Moneda** (por ejemplo DOP o USD) y enciende **Aceptar pagos con Stripe**.
4. Toca **Probar conexión**: si todo está bien, muestra el nombre de tu cuenta.
5. Toca **Guardar**.
6. **Prueba:** con llaves de prueba, paga con la tarjeta de ejemplo `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC.
- Las llaves se guardan **cifradas**. Para cambiar la llave, pega una nueva (si dejas el campo vacío, se conserva la anterior).
- **El webhook es opcional**: el sistema consulta a Stripe directamente.

#### D2) Pagos con cripto (Bitcoin y Lightning)
**Qué es:** una forma de que los clientes paguen escaneando un **código QR con la billetera de criptomonedas de su celular**, igual que en los restaurantes más modernos. Ellos pagan en **Bitcoin** o en **Lightning** (una forma de pagar Bitcoin que llega **al instante**).

**Cómo funciona, paso a paso:**
1. El mesero elige **Cripto — Bitcoin ⚡** como forma de pago y el sistema le pide a tu **BTCPay Server** un cobro por el monto.
2. Aparece un **QR**. El cliente lo escanea con su billetera y confirma.
3. El sistema **se entera solo** cuando el dinero llega (la ventana dice **"Pago confirmado"**) y emite la factura.
4. El dinero queda **directo en tu billetera**. No pasa por ninguna empresa en medio y no hay comisión por cada pago (solo la pequeña tarifa normal de la red).

**¿Qué es BTCPay Server?** Es el programa gratuito que "cobra por ti": crea los QR y avisa cuando se pagó. Lo controlas tú. El sistema del restaurante solo se conecta a él.

##### Lo que falta de tu lado (lista de tareas)
Esto lo hace el **dueño o administrador** una sola vez. Si no te sientes cómodo, pídele ayuda a quien te instaló el sistema.
- [ ] **1. Tener un BTCPay Server.** Dos caminos: **(a)** contratar un **hosting de BTCPay ya listo** (lo más fácil, sin instalar nada), o **(b)** instalarlo en el servidor del restaurante (necesita unos **2 GB de memoria**). Te dará una **dirección web** (por ejemplo `https://btcpay.mirestaurante.com`).
- [ ] **2. Crear una cuenta y una "tienda"** dentro de BTCPay.
- [ ] **3. Conectar tu billetera** a esa tienda (así el dinero llega a ti). Anota las **palabras de recuperación** de tu billetera en papel y guárdalas en un lugar seguro: **quien las tenga, controla el dinero**.
- [ ] **4. Activar Lightning** en la tienda (recomendado: los pagos pequeños llegan al instante y el cliente no espera).
- [ ] **5. Poner la velocidad de la tienda en "High speed"** (Settings → Checkout) para que los pagos pequeños en Bitcoin no hagan esperar al cliente.
- [ ] **6. Crear una API key** (*Manage Account → API Keys → Generate Key*) con **solo** estos cuatro permisos y limitada a tu tienda: **ver facturas**, **crear facturas**, **modificar facturas** y **ver la configuración de la tienda**. (Una "API key" es como una llave que le deja al sistema pedir cobros, nada más.)
- [ ] **7. Copiar tu Store ID** (*Settings → General*).
- [ ] **8. Conectarlo al sistema:** **Ajustes → Pagos con cripto**. Pega la **dirección de tu BTCPay**, el **Store ID** y la **API key**; enciende **Aceptar pagos con cripto**; toca **Probar conexión** (debe decir *"Conexión correcta"* con el nombre de tu tienda) y luego **Guardar**.
- [ ] **9. Hacer una prueba real pequeña** *antes de abrir*: cobra una venta de prueba de unos pocos pesos con **tu propia billetera** y comprueba que el sistema diga **"Pago confirmado"** y que el dinero llegue.
- [ ] **10. Capacitar al personal** con la sección 4.9 (Cobrar con cripto).
- [ ] **11. Hablar con tu contador** (ver el aviso legal más abajo).
- [ ] **12. Solo si usas el asistente de voz (Vapi):** cuando tengas la llave de Vapi, pídele a quien administra el sistema que ejecute `npm run vapi:sync` para que el asistente también ofrezca pagar con cripto.

##### Detalles importantes
- La API key se guarda **cifrada**. Si dejas ese campo vacío al guardar, se conserva la anterior.
- **Moneda:** deja la de tus precios (peso dominicano). Si tu BTCPay no tiene tasa de cambio para ella, elige **USD** y escribe cuántos pesos vale 1 dólar; **actualiza ese número cuando cambie**.
- **Delivery:** el pedido puede quedar con pago **Cripto**; en la tarjeta del pedido toca **Cobro cripto** para ver el QR y enviar el enlace por WhatsApp. Los asistentes de voz y WhatsApp también pueden ofrecerlo (te llegará un aviso de **pago recibido**).
- **Devoluciones:** el sistema **no devuelve dinero solo**. Si hay que devolver un pago cripto, se hace **a mano** desde tu billetera. Si cancelas un pedido de delivery ya pagado, el sistema te lo recuerda.
- **El precio en BTC cambia** de un momento a otro. El cobro se fija por un rato corto; si el cliente tarda demasiado, el cobro **vence** y se genera uno nuevo (toca **Cancelar cobro** y repite).
- **Importante (legal):** en la República Dominicana las criptomonedas **no son moneda de curso legal**: el Banco Central no obliga a nadie a aceptarlas y su uso por un comercio privado es **voluntario**. Las ganancias al **vender** criptomonedas se declaran a la **DGII**. Consulta con tu contador cómo registrar estas ventas.

#### D2b) Alertas de tiempo (para que no se quede ningún pedido olvidado)
En las pantallas de **Cocina** y **Delivery**, cada pedido muestra desde cuándo se envió ("07:56 · hace 12 min"). Cuando **pasa demasiado tiempo sin atenderse**, ese texto cambia de color solo:
- **Normal (gris):** todo va bien.
- **⚠️ Amarillo:** ya lleva un rato; hay que apurarse.
- **🚨 Rojo:** demora seria. El número **late**, la tarjeta se **resalta en rojo** y abajo a la derecha aparece un aviso flotante **"N pedidos con demora"**. En **Cocina** además suena un **pitido** cada vez que un pedido nuevo llega al rojo.

**Para ajustar los tiempos:** **Ajustes → Alertas de tiempo**.
1. **Cocina:** a los cuántos minutos (desde que el pedido se envía) se pone **amarillo** y a los cuántos **rojo**. Por defecto **10 y 20**.
2. **Delivery "por confirmar":** a los cuántos minutos se pone **rojo** un pedido que nadie ha confirmado (se pone amarillo a la mitad). Por defecto **5**.
3. **Sonido:** enciéndelo o apágalo.
4. Toca **Guardar**. Se aplica en menos de un minuto.

> 💡 Los platos que ya están **listos** y nadie recoge también cuentan el tiempo desde que quedaron listos: así el mesero no deja la comida enfriándose.
> 💡 El navegador solo deja sonar el pitido si alguien **tocó la pantalla** de cocina al menos una vez desde que la abrió. Toca cualquier parte al abrirla.

#### D3) Redes y pie de página
Abajo de todas las pantallas del sistema aparece un **pie de página** con tus **redes sociales** (Facebook, Instagram, X, TikTok, YouTube, LinkedIn y Pinterest) y un botón verde de **WhatsApp ("Escríbenos")**. Se configura en **Ajustes → Redes y pie**:
1. **Agencia:** el nombre que sale como "Desarrollado por…" (por ejemplo, Betha IA).
2. **WhatsApp:** el número con código de país, solo números (por ejemplo `18499192565`). Si lo dejas vacío, el botón no aparece.
3. **Cada red** tiene un interruptor **Mostrar** y una casilla para su **enlace**. Al tocar su ícono, se abre ese enlace en una pestaña nueva.
   - Al inicio cada ícono abre la **página principal** de su red. Cuando tengas tus cuentas reales, **pega la dirección completa de tu perfil** (empieza con `https://`).
   - Si apagas **Mostrar**, esa red **no aparece**. Si la dejas encendida pero **sin enlace**, el ícono se ve **apagado** ("próximamente") y no se puede tocar.
4. Toca **Guardar**. Los cambios se ven al recargar cualquier pantalla (en menos de un minuto).

#### E) QR del menú por mesa
**Ajustes → QR del menú** (o botón **QR menú** en Mesas).
1. Verás un **QR por cada mesa**. Toca **Imprimir** y pega cada código en su mesa.
2. El cliente lo escanea con la cámara y ve la **carta con fotos**, puede **pedir**, **llamar al mesero** y **pedir la cuenta**.
3. **Probar** abre el menú de esa mesa para que lo veas como el cliente.
4. **Nuevo QR**: invalida el código anterior (úsalo si alguien se llevó o fotografió un QR de forma indebida). Hay que imprimir el nuevo.
5. Si ves el aviso amarillo de "localhost", abre el sistema con la dirección real (la de internet o la IP de la red) antes de imprimir; de lo contrario los celulares no podrán abrir los QR.

#### F) Delivery y agentes (datos que usan los asistentes)
**Ajustes → Delivery y agentes.** **Es muy importante llenarlo**: los asistentes de llamadas y WhatsApp solo informan lo que está aquí. Lo que no esté, lo responderán como "no lo sé" en lugar de inventarlo.
- **Delivery:** enciende **Aceptar pedidos de delivery de clientes (agentes)**; define el **Pedido mínimo para delivery** (sin contar el envío) y el **Tiempo de preparación** en minutos.
- **Zonas de entrega y costo de envío:** con **Agregar zona** crea cada zona (ejemplo: *Bávaro*, *Cap Cana*, *Uvero Alto*) con su **costo de envío** y los **minutos** de camino. El switch **Activa** la enciende o apaga.
- **Horario:** para cada día marca **Cerrado** o pon la hora de apertura y cierre, y si ese día hace **Delivery**. Si cierras pasada la medianoche, escribe la hora normal (abre 11:00, cierra 01:00).
- **Pagos y atención humana:** **Datos para transferencias** (banco, cuenta, titular) y el **Teléfono para pasar con una persona** (a ese número se transfieren las llamadas cuando el cliente lo pide).
- **Preguntas frecuentes:** con **Agregar** escribe preguntas y respuestas reales (¿Tienen parqueo? ¿Aceptan mascotas? ¿Hay menú infantil?).
- Toca **Guardar cambios**.

#### G) Asistentes IA (voz y WhatsApp)
**Ajustes → Asistentes IA.** Verás dos tarjetas con una lista de verificación (✅ o ❌) que te dice qué falta.

**Agente de voz (llamadas con Vapi)**
- Responde las llamadas en el **idioma del cliente**, ofrece el menú, toma pedidos y reservas, y puede **pasar la llamada a una persona**.
- Campos: **Primer mensaje al contestar** (vacío = saludo automático en español e inglés), **Instrucciones adicionales** (por ejemplo "ofrece siempre el postre del día"), **ID del número en Vapi** y el **Número para recibir llamadas**.
- Toca **Guardar y publicar en Vapi**. Cada vez que cambies el menú, el horario o las instrucciones importantes, **vuelve a publicar**.
- **Ver instrucciones** te muestra exactamente lo que "lee" el asistente (se arma solo con tus datos).
- Para que lleguen las llamadas, el número de tu restaurante debe **desviarse** al número de Vapi (pídeselo a tu operadora).

**WhatsApp**
1. Toca **Conectar WhatsApp**. Aparece un **código QR**.
2. En el teléfono del restaurante abre WhatsApp → **Dispositivos vinculados** → **Vincular un dispositivo** y escanea el QR.
3. Cuando diga **Conectado**, enciende **El asistente responde los mensajes**.
4. **Avisos automáticos al cliente**: activa o desactiva los mensajes de pedido confirmado, en camino, factura y recordatorio de reserva.
5. **Enviar prueba**: pon un número tuyo y comprueba que llega.
6. **Desconectar** borra la conexión.
- Para no perder el número de WhatsApp: úsalo de forma normal, **no hagas envíos masivos**; el asistente solo **responde** y manda avisos del propio pedido o reserva.

**Qué hace cada asistente por el cliente:** informa menú, precios, horario y zonas; calcula el total con envío; toma pedidos de **delivery o para llevar**; ofrece pagar **en efectivo, transferencia o con enlace seguro de tarjeta**; hace **reservas**; y pasa con una persona si hay una queja o algo que no puede resolver. **Los pedidos y reservas que toma NO van directo a cocina: llegan "Por confirmar" y tú o un mesero los confirman.** Así evitas errores.

### 6.10 Rutina sugerida para el día

**Al abrir**
1. Entra al **Dashboard** y revisa que no haya pedidos o avisos pendientes de ayer.
2. En **Productos**, apaga **Disponible** de lo que no tengas hoy.
3. En **Inventario**, revisa **Stock bajo**.
4. En **Reservas**, mira las del día y confirma las **Por confirmar**.
5. Verifica en **Ajustes → Asistentes IA** que **WhatsApp** esté **Conectado**.

**Durante el servicio**
- Atiende los **avisos con sonido** y los pedidos **Por confirmar** en Delivery.
- Revisa **Chats IA** para ver si algún cliente necesita una persona.

**Al cerrar**
1. En **Ventas**, filtra por **hoy** y compara el total con la caja (**efectivo**, **tarjeta**, **transferencia**).
2. Toca **Exportar** si tu contador lo pide.
3. Revisa en Delivery que no queden pedidos sin cerrar.
4. Cierra sesión.

---

## 7. Para los CLIENTES: qué ve quien te visita o te escribe {roles=}

Esta parte te sirve para **explicarle a tus clientes** cómo usar los servicios.

### 7.1 Menú digital con código QR
1. El cliente escanea el **QR de su mesa** con la cámara del celular.
2. Ve la carta con **fotos**, descripción, precio y categorías. Lo que está **Agotado** aparece en gris y no se puede pedir.
3. Toca **+** para agregar platos y puede escribir una **nota** (por ejemplo, "sin cebolla").
4. Toca **Ver pedido** → escribe su nombre (opcional) → **Enviar pedido**.
5. Aparece **"Tu mesa"** con el estado de cada plato: *Por confirmar*, *En cocina*, *Preparando*, *¡Listo!*, *Servido*.
6. Los botones de arriba: **Llamar mesero** y **Pedir la cuenta** (elige cómo pagará).
> Su pedido **no empieza a prepararse** hasta que un mesero lo confirme.

### 7.0 Pedir desde la app del restaurante
1. El cliente abre tu **enlace** (o escanea tu **QR**) y toca **Instalar app** para tenerla en su pantalla de inicio (en iPhone: **Compartir → Añadir a pantalla de inicio**).
2. Ve el **plato del día** y el menú por categorías, y toca **+** para armar su pedido.
3. Toca **Ver mi pedido**, elige **A domicilio** o **Para recoger**, escribe su **nombre, teléfono y dirección** (y la **zona**, que define el envío) y elige **cómo pagar**.
4. Toca **Enviar pedido**. Si eligió **tarjeta o cripto**, lo lleva a una **página de pago segura**; al terminar vuelve a la app. Si eligió **transferencia**, ve tus datos bancarios y envía la foto del comprobante por WhatsApp.
5. En **"Tu pedido"** ve en qué paso va y puede **cancelar** mientras el restaurante no lo haya confirmado. Si ya se confirmó, debe llamar al restaurante.

### 7.2 Reservar por internet
El cliente entra a la dirección del restaurante terminada en **/reservar**, elige **cuántas personas**, **fecha y hora**, escribe su **nombre** y **teléfono o correo**, y toca **Solicitar reserva**. Verá "¡Solicitud recibida!". El restaurante la confirma después.

### 7.3 Pedir por llamada o por WhatsApp
- El cliente llama o escribe al número del restaurante. Un **asistente virtual** contesta **en el idioma del cliente**.
- Puede pedir el menú, hacer un pedido para **delivery** o **para llevar**, reservar, preguntar horarios y zonas de entrega.
- El asistente **repite el pedido completo y el total** antes de registrarlo.
- Si paga con tarjeta o con cripto, recibe un **enlace seguro** por WhatsApp. **Nunca** se le piden números de tarjeta por llamada o chat.
- Si pide **hablar con una persona**, el asistente avisa al personal.
- Después recibe **mensajes automáticos**: pedido confirmado, en camino y la factura.

### 7.4 Pagar con un enlace
Al abrir el enlace, el cliente paga con tarjeta, Apple Pay o Google Pay en la página segura de Stripe. Al terminar ve **"¡Pago recibido!"**. El restaurante se entera al instante.

### 7.5 Pagar con criptomonedas
Si el restaurante lo tiene activado, el cliente puede pagar con **Bitcoin o Lightning**: escanea el **QR** que le muestra el mesero (o abre el **enlace** que recibe por WhatsApp si pidió delivery), elige pagar con su **billetera** y confirma. Con **Lightning** el pago es **instantáneo**. El restaurante se entera solo cuando el pago llega.

---

## 8. Qué hacer si algo no funciona {roles=}

| Problema | Qué hacer |
|---|---|
| **No me deja entrar** ("Usuario o contraseña incorrectos") | Revisa mayúsculas y espacios. Si sigue, pide al administrador que te cambie la contraseña o confirme que tu usuario esté **Activo**. |
| **Me aparece "No autorizado"** | Esa pantalla no es de tu rol. Vuelve con el menú. Si la necesitas, habla con el administrador. |
| **La página no carga o se queda en blanco** | Revisa tu internet. Recarga la página (jala hacia abajo en el celular, o `F5` en computadora). Si sigue, avisa al administrador. |
| **No veo los cambios (precio, plato nuevo)** | Recarga la página. Si usas la app instalada, ciérrala y ábrela de nuevo. |
| **No aparece un producto al buscarlo** | Revisa la ortografía. Pídele al administrador que verifique que el producto exista y esté **Disponible**. |
| **Un producto aparece Agotado** | El administrador lo apagó. Para activarlo: **Productos → editar → Disponible**. |
| **No puedo eliminar una mesa** | Tiene un pedido activo. Primero cobra la factura o **Liberar mesa**. |
| **No me deja crear un cliente al facturar** | Es normal para meseros. Usa "Consumidor final" o pide al administrador que lo cree. |
| **La cocina no recibe un plato** | Falta tocar **Enviar a cocina** (o **Confirmar** en Delivery). |
| **Un cliente dice que la app no le deja pedir** | Revisa que **Recibir pedidos desde la app** esté encendido (**Ajustes → App de clientes**), que **estés dentro del horario** y que la **zona** y el **pedido mínimo** sean correctos. Si pidió varios pedidos seguidos con el mismo teléfono, el sistema lo frena unos minutos. |
| **Un pedido se ve en rojo o dice "con demora"** | Es una alerta: lleva demasiado tiempo sin atenderse. En **Cocina**, empieza a prepararlo; en **Delivery**, confírmalo o revísalo. El administrador puede cambiar los tiempos en **Ajustes → Alertas de tiempo**. |
| **No me llegó el aviso de "plato listo"** | Debes estar en la pantalla de **Mesas** y haber **tocado la pantalla una vez** después de abrirla (para el sonido). El estado igual se ve en la mesa: etiqueta verde **Listo** y la mesa resaltada. |
| **No suena el aviso de demora en Cocina** | El navegador necesita que alguien **toque la pantalla** una vez al abrirla. Toca cualquier parte. También revisa que el sonido esté encendido en **Alertas de tiempo** y que el volumen del equipo esté arriba. |
| **Un pedido de la app dice "Esperando pago"** | El cliente eligió tarjeta o cripto y aún no ha pagado. No lo confirmes hasta ver **"Pagado"**. Si pasa **1 hora** sin pagar, se cancela solo. |
| **No aparece la opción "Cripto" al cobrar** | El administrador no ha activado los pagos con cripto o falta algún dato. Revisa **Ajustes → Pagos con cripto**: interruptor encendido, dirección, Store ID y API key guardados. |
| **"Probar conexión" falla en Pagos con cripto** | Revisa que la **dirección** de tu BTCPay esté bien escrita y abra en el navegador, que el **Store ID** sea el de tu tienda y que la **API key** tenga los 4 permisos. Si dice que no hay tasa de cambio, elige **USD** y escribe la tasa. |
| **El cobro cripto no se confirma** | Pídele al cliente que **termine el pago** en su billetera. Con Bitcoin normal puede tardar unos minutos (dirá *"Pago detectado, confirmando…"*): espera. Si venció o lo cerró, toca **Cancelar cobro** y genera uno nuevo. Si ya pagó y no aparece, avisa al administrador para revisar en BTCPay. |
| **El cobro con Stripe no se confirma** | Pide al cliente que termine el pago en su celular. Si lo cerró, toca **Cancelar cobro** y genera uno nuevo. Verifica con el administrador que Stripe esté activado. |
| **No me deja "Entregado y cobrar" en delivery** | Falta un paso: **Validar pago** (transferencia), o el pago con Stripe aún no se confirmó, o los platos no están listos en cocina. |
| **No me deja facturar: "Este pedido ya fue facturado"** | Ya se cobró antes. Revisa el historial en **Ventas**. |
| **El asistente de WhatsApp no responde** | En **Ajustes → Asistentes IA** revisa que esté **Conectado** y **"El asistente responde los mensajes"** encendido. Si dice "Esperando conexión", vuelve a escanear el QR. Puede que alguien haya escrito desde el teléfono y el asistente se pausó: en **Chats IA** toca **Devolver al asistente**. |
| **El asistente de llamadas no contesta** | Revisa en **Ajustes → Asistentes IA** que los 5 puntos estén ✅ y vuelve a tocar **Guardar y publicar en Vapi**. Verifica con tu operadora el **desvío de llamadas**. |
| **Los códigos QR de las mesas no abren en el celular** | Se imprimieron con la dirección "localhost". Abre el sistema con su dirección real y vuelve a imprimirlos (ver 6.9 E). |
| **La impresora no imprime** | Revisa que esté encendida y con papel. En **Ajustes → Impresión** confirma ancho de papel e impresora. Si usas el sistema desde internet, imprime desde el navegador del equipo que tiene la impresora. |
| **Se cerró mi sesión sola** | Por seguridad las sesiones duran **12 horas**. Entra de nuevo. |
| **Hice algo por error** | Los platos pendientes se editan o eliminan; los enviados se **cancelan**; los pedidos se **liberan**. Lo ya **facturado** no se borra: pide ayuda al administrador. |

> ⚠️ Si ves el mensaje **"Error interno del servidor"**, anota **qué estabas haciendo** y la hora, y avísale al administrador para que lo revise.

---

## 9. Glosario (palabras explicadas fácil) {roles=}

| Palabra | Significado |
|---|---|
| **Administrador** | El dueño o encargado con acceso total. |
| **Asistente (IA)** | Un programa que conversa por teléfono o WhatsApp para atender clientes. |
| **Comanda** | El papel (o pantalla) con lo que la cocina debe preparar. |
| **Consumidor final** | Cliente genérico para ventas sin datos. |
| **Dashboard** | El tablero de inicio con los números del día. |
| **Delivery** | Entrega a domicilio. |
| **DEL-N / LLEVAR-N** | El código de un pedido de delivery o para llevar (por ejemplo DEL-12). |
| **Enlace de pago** | Dirección que el cliente abre para pagar con su tarjeta. |
| **Factura** | El comprobante de lo cobrado. |
| **Hijos (de un producto)** | Opciones de un plato (por ejemplo, el acompañante). |
| **Insumo** | Un ingrediente o material (carne, arroz, bebidas). |
| **App instalable** | Una página web que el cliente "instala" en su celular y se abre como una app, sin descargarla de una tienda. |
| **Datos de demostración** | Información de ejemplo (menú, ventas, clientes…) para practicar. Se quitan con un botón antes de abrir. |
| **kg / lb** | Kilo y libra, las dos unidades de peso. 1 kg = 2,2046 lb; 1 lb = 0,4536 kg. |
| **Margen** | El porcentaje de ganancia de un plato. |
| **Merma** | Producto que se pierde o se daña. |
| **Navegador** | El programa para entrar a internet (Chrome, Safari, Edge). |
| **Pedido pendiente** | Un plato anotado que aún no se envió a cocina. |
| **Por confirmar** | Pedido o reserva que espera que una persona del restaurante la apruebe. |
| **QR** | Un cuadrito de puntos que el celular lee con la cámara. |
| **Receta** | Qué ingredientes y cuánto usa un plato. |
| **Rol** | El tipo de usuario: administrador, mesero o cocinero. |
| **Sesión** | El tiempo que estás "dentro" del sistema con tu usuario. |
| **Stripe** | El servicio que procesa los pagos con tarjeta por internet. |
| **Criptomoneda / Bitcoin** | Dinero digital que se paga desde una billetera en el celular, sin banco en medio. |
| **Lightning** | Una forma de pagar Bitcoin que llega al instante y casi sin costo. |
| **Billetera (wallet)** | La aplicación donde se guarda el dinero cripto. La del cliente paga; la tuya recibe. |
| **BTCPay Server** | El programa gratuito que crea los QR de cobro y avisa cuando llegó el pago. Lo controlas tú. |
| **API key** | Una "llave" que le permite al sistema pedir cobros a otro programa (por ejemplo BTCPay), solo con los permisos que le des. |
| **Stock** | La cantidad que tienes de algo en inventario. |
| **Ticket promedio** | Lo que gasta, en promedio, cada cliente. |
| **Vapi** | El servicio que permite que el asistente conteste llamadas. |
| **WhatsApp conectado** | El teléfono del restaurante está vinculado al sistema para atender mensajes. |

---

## 10. Buenas prácticas y seguridad {roles=}

1. **Cada persona, su usuario.** No compartas contraseñas.
2. **Cambia la contraseña inicial** (`admin123`) apenas entres por primera vez.
3. **Cierra sesión** al terminar, sobre todo en equipos compartidos.
4. **Revisa los pedidos "Por confirmar"** antes de aprobarlos: dirección, platos y total.
5. **Nunca pidas ni guardes** números de tarjeta de los clientes. Para cobrar con tarjeta usa el datáfono o el **enlace/QR de Stripe**.
6. **Mantén el menú actualizado**: apaga **Disponible** de lo que se agotó; los asistentes y el menú QR usan esa información.
7. **Llena bien Delivery y agentes** (horario, zonas, preguntas frecuentes): es la "memoria" de tus asistentes.
8. **Revisa las conversaciones** de los asistentes la primera semana y ajusta las **Instrucciones adicionales** si algo no suena como quieres.
9. **No hagas mensajes masivos** por el WhatsApp conectado al asistente.
10. **Guarda tus llaves** (Stripe, BTCPay, Vapi, OpenAI) en un lugar seguro y **no las compartas por chat**. Las **palabras de recuperación** de tu billetera cripto, guárdalas **en papel**, nunca en el celular ni por mensaje.
11. **Haz copias periódicas** exportando las **Ventas** a Excel.

---

*¿Te falta algo? Pide al administrador que agregue la explicación a esta guía: el archivo se puede editar con cualquier editor de texto.*
