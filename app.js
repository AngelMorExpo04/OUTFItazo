// ======== Configuración de Base de Datos (IndexedDB) ========
const DB_NAME = 'WardrobeDB';
const DB_VERSION = 1;
const STORE_NAME = 'clothes';
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject('Error al abrir IndexedDB');
        request.onsuccess = (e) => { db = e.target.result; resolve(); };
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

function saveItem(item) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject('Error al guardar');
    });
}

function getAllItems() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject('Error al leer');
    });
}

function deleteItem(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject('Error al borrar');
    });
}

// ======== Utilidades ========
// Convertir archivo a Base64 para guardarlo en la DB
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Reducir la imagen para evitar que el móvil se quede sin memoria RAM
function resizeImage(file, maxSize = 800) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height && width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Convertimos a WebP ligero
                canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.8);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Procesar imagen con IA para quitar fondo
async function processImageWithAI(file) {
    if (!file) return null;
    
    // Primero, redimensionamos la imagen
    const submitBtn = document.querySelector('button[type="submit"]');
    submitBtn.innerText = 'Comprimiendo imagen...';
    const resizedBlob = await resizeImage(file);

    try {
        submitBtn.innerText = 'Quitando fondo (IA)...';
        
        const module = await import("https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm");
        const imglyRemoveBackground = module.removeBackground || module.default;
        
        const blob = await imglyRemoveBackground(resizedBlob);
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    } catch (err) {
        console.error("Error al quitar el fondo:", err);
        alert("El móvil no pudo procesar la IA (falta de RAM o conexión). Se guardará la imagen comprimida con fondo.");
        return await fileToBase64(resizedBlob);
    }
}

// ======== Tooltip de Información de Prendas ========
function showTooltip(item, targetElement) {
    const tooltip = document.getElementById('clothing-tooltip');
    
    const categoryNames = {
        'top': 'Parte de arriba',
        'outerwear': 'Sudadera / Chaqueta',
        'bottom': 'Parte de abajo',
        'shoes': 'Calzado'
    };
    
    tooltip.innerHTML = `
        <div style="font-weight: 800; font-size: 0.75rem; margin-bottom: 2px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">${item.name}</div>
        <div style="font-size: 0.6rem; opacity: 0.9; text-shadow: 1px 1px 2px rgba(0,0,0,0.6);">${categoryNames[item.category] || item.category}</div>
        <div style="font-size: 0.55rem; text-transform: uppercase; font-weight: 600; margin-top: 2px; opacity: 0.8; text-shadow: 1px 1px 2px rgba(0,0,0,0.6);">${item.style}</div>
    `;
    
    tooltip.style.background = getTazoBackground(item.category, item.style);
    tooltip.classList.add('show');
    
    // Position it correctly within the closet-interior relative container
    const targetRect = targetElement.getBoundingClientRect();
    const containerRect = document.getElementById('mannequin').getBoundingClientRect();
    
    // Center vertically relative to target, place slightly to the right of the center
    // (since targetRect spans the whole mannequin width, targetRect.width / 2 is the center)
    const top = targetRect.top - containerRect.top + (targetRect.height / 2);
    const left = (targetRect.left - containerRect.left) + (targetRect.width / 2) + 35;
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    
    // Auto hide after 3 seconds
    clearTimeout(tooltip.hideTimeout);
    tooltip.hideTimeout = setTimeout(() => {
        tooltip.classList.remove('show');
    }, 3000);
}

document.querySelector('.top-group').addEventListener('click', function(e) {
    e.stopPropagation();
    if (!currentOutfit) return;
    if (currentOutfit.outerwear) {
        showTooltip(currentOutfit.outerwear, this);
    } else if (currentOutfit.top) {
        showTooltip(currentOutfit.top, this);
    }
});

document.getElementById('layer-bottom').addEventListener('click', function(e) {
    e.stopPropagation();
    if (!currentOutfit || !currentOutfit.bottom) return;
    showTooltip(currentOutfit.bottom, this);
});

document.getElementById('layer-shoes').addEventListener('click', function(e) {
    e.stopPropagation();
    if (!currentOutfit || !currentOutfit.shoes) return;
    showTooltip(currentOutfit.shoes, this);
});

// Ocultar al pinchar en otra parte
document.getElementById('closet-stage').addEventListener('click', () => {
    document.getElementById('clothing-tooltip').classList.remove('show');
});

// ======== Navegación de Pestañas ========
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab + '-tab').classList.add('active');
    });
});

// Ocultar campo "espalda" si es calzado
document.getElementById('item-category').addEventListener('change', (e) => {
    const backUpload = document.getElementById('back-img-container');
    if (e.target.value === 'shoes') {
        backUpload.style.display = 'none';
        document.getElementById('img-back').required = false;
    } else {
        backUpload.style.display = 'block';
    }
});

// ======== Gestión del Formulario ========
document.getElementById('add-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.innerText = 'Guardando...';
    submitBtn.disabled = true;

    try {
        const category = document.getElementById('item-category').value;
        const name = document.getElementById('item-name').value;
        const color = document.getElementById('item-color').value;
        const style = document.getElementById('item-style').value;
        
        const frontFile = document.getElementById('img-front').files[0];
        const backFile = document.getElementById('img-back').files[0];

        const frontBase64 = await processImageWithAI(frontFile);
        const backBase64 = await processImageWithAI(backFile);

        const newItem = {
            category,
            name,
            color,
            style,
            imgFront: frontBase64,
            imgBack: backBase64
        };

        await saveItem(newItem);
        e.target.reset();
        await loadWardrobe();
        
        // Open the drawer automatically to show the new item
        const drawer = document.getElementById('collection-drawer');
        if (drawer && !drawer.classList.contains('open')) {
            drawer.classList.add('open');
        }
        
        alert('Prenda guardada con éxito!');
        
        // Volver a mostrar input espalda si se ocultó
        document.getElementById('back-img-container').style.display = 'block';
    } catch (error) {
        console.error(error);
        alert('Error al guardar la prenda.');
    } finally {
        submitBtn.innerText = 'Guardar en Armario';
        submitBtn.disabled = false;
    }
});

// Función para generar fondo estilo Tazo dependiendo de la categoría y el estilo
function getTazoBackground(category, style) {
    // Paleta pastel inspirada en el logo (sin blanco)
    const colors = {
        blue: { h: 216, s: 78, l: 78 },
        mint: { h: 163, s: 44, l: 76 },
        yellow: { h: 52, s: 85, l: 79 },
        pink: { h: 337, s: 78, l: 85 },
        purple: { h: 282, s: 57, l: 77 }
    };

    let c = colors.blue; // Default

    // Cada prenda (categoría) tiene su propio color base distinto
    if (category === 'top') {
        c = colors.pink;
    } else if (category === 'outerwear') {
        c = colors.purple;
    } else if (category === 'bottom') {
        c = colors.blue;
    } else if (category === 'shoes') {
        c = colors.mint;
    }
    
    // Los diferentes estilos dentro de la misma prenda son variaciones sutiles del mismo color
    let hMod = 0;
    let lMod = 0;
    
    if (style === 'casual') {
        hMod = 0; lMod = 0;
    } else if (style === 'streetwear') {
        hMod = -8; lMod = -5; // Ligeramente más oscuro y desviado
    } else if (style === 'sport') {
        hMod = 8; lMod = 3;  // Ligeramente más claro
    } else if (style === 'formal') {
        hMod = 12; lMod = -8; // Más oscurecido
    }

    let finalH = c.h + hMod;
    let finalL = c.l + lMod;

    // Devolvemos un gradiente radial con centro más claro para volumen 3D
    return `radial-gradient(circle at 30% 30%, hsl(${finalH}, ${c.s}%, ${finalL + 8}%), hsl(${finalH}, ${c.s}%, ${finalL - 6}%))`;
}

// ======== Renderizar Galería ========
async function loadWardrobe() {
    const grid = document.getElementById('gallery-grid');
    const items = await getAllItems();
    
    if (items.length === 0) {
        grid.innerHTML = '<p class="empty-msg">Aún no has añadido ninguna prenda.</p>';
        return;
    }

    grid.innerHTML = '';
    items.forEach(item => {
        const wrapper = document.createElement('div');
        wrapper.className = 'tazo-pocket';

        const div = document.createElement('div');
        div.className = 'wardrobe-item';
        div.style.background = getTazoBackground(item.category, item.style);
        
        div.innerHTML = `
            <img src="${item.imgFront}" alt="${item.name}">
            <h4>${item.name}</h4>
            <div class="tazo-badges">
                <span class="item-badge">${item.category}</span>
                <span class="item-badge" style="background: rgba(0,0,0,0.5)">${item.style}</span>
            </div>
        `;
        
        // Evento para borrar (movido al sleeve)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = 'Borrar prenda';
        deleteBtn.innerHTML = '✖';
        
        deleteBtn.addEventListener('click', async () => {
            if (confirm(`¿Seguro que quieres borrar "${item.name}" de tu armario?`)) {
                try {
                    await deleteItem(item.id);
                    await loadWardrobe();
                    
                    // Si la prenda borrada está en el outfit actual, recargamos el maniquí
                    if (currentOutfit && 
                       (currentOutfit.top?.id === item.id || 
                        currentOutfit.bottom?.id === item.id || 
                        currentOutfit.shoes?.id === item.id)) {
                        currentOutfit = null;
                        renderMannequin();
                    }
                } catch (error) {
                    console.error(error);
                    alert("Error al intentar borrar la prenda.");
                }
            }
        });
        
        wrapper.appendChild(deleteBtn);
        wrapper.appendChild(div);
        
        grid.appendChild(wrapper);
    });
}

// ======== Generador de Outfits ========
let currentOutfit = null; // { top: null, bottom: null, shoes: null }
let isFlipped = false;

document.querySelectorAll('.arcade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.arcade-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById('gen-mode').value = e.currentTarget.dataset.mode;
    });
});

document.getElementById('generate-btn').addEventListener('click', async () => {
    const joystickContainer = document.getElementById('generate-btn');
    const mode = document.getElementById('gen-mode').value;
    const includeOuterwear = document.getElementById('include-outerwear').checked;
    const items = await getAllItems();
    
    // Animar Joystick
    joystickContainer.classList.add('pulled');
    setTimeout(() => joystickContainer.classList.remove('pulled'), 200);
    
    const tops = items.filter(i => i.category === 'top');
    const outerwears = items.filter(i => i.category === 'outerwear');
    const bottoms = items.filter(i => i.category === 'bottom');
    const shoes = items.filter(i => i.category === 'shoes');

    if (tops.length === 0 || bottoms.length === 0 || shoes.length === 0) {
        alert('Necesitas al menos una prenda de cada categoría (Arriba, Abajo, Calzado) para generar un outfit.');
        return;
    }
    if (includeOuterwear && outerwears.length === 0) {
        alert('Has marcado incluir sudadera pero no tienes ninguna guardada en tu armario.');
        return;
    }

    if (mode === 'manual') {
        openManualModal(tops, outerwears, bottoms, shoes);
        return;
    }

    // Efecto de carga
    document.getElementById('mannequin').classList.add('generating');
    joystickContainer.style.pointerEvents = 'none';

    setTimeout(() => {
        if (mode === 'random') {
            generateRandom(tops, outerwears, bottoms, shoes, includeOuterwear);
        } else {
            generateSmart(tops, outerwears, bottoms, shoes, includeOuterwear);
        }
        document.getElementById('mannequin').classList.remove('generating');
        joystickContainer.style.pointerEvents = 'auto';
        isFlipped = false;
        renderMannequin();
    }, 1000);
});

function getRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateRandom(tops, outerwears, bottoms, shoes, includeOuterwear) {
    currentOutfit = {
        top: getRandom(tops),
        outerwear: includeOuterwear ? getRandom(outerwears) : null,
        bottom: getRandom(bottoms),
        shoes: getRandom(shoes)
    };
}

// Algoritmo Inteligente Básico
function generateSmart(tops, outerwears, bottoms, shoes, includeOuterwear) {
    // 1. Elegir un top aleatorio
    const top = getRandom(tops);
    const targetStyle = top.style;

    // Outerwear opcional
    let outerwear = null;
    if (includeOuterwear) {
        let matchingOuterwears = outerwears.filter(o => o.style === targetStyle);
        outerwear = matchingOuterwears.length > 0 ? getRandom(matchingOuterwears) : getRandom(outerwears);
    }

    // 2. Filtrar bottoms que compartan estilo (o coger cualquiera si no hay)
    let matchingBottoms = bottoms.filter(b => b.style === targetStyle);
    if (matchingBottoms.length === 0) matchingBottoms = bottoms;
    
    // Regla de color simple: si el top no es neutro, buscar bottom neutro preferentemente
    if (top.color !== 'neutral') {
        let neutralBottoms = matchingBottoms.filter(b => b.color === 'neutral');
        if (neutralBottoms.length > 0) matchingBottoms = neutralBottoms;
    }
    const bottom = getRandom(matchingBottoms);

    // 3. Filtrar zapatos por estilo
    let matchingShoes = shoes.filter(s => s.style === targetStyle);
    if (matchingShoes.length === 0) matchingShoes = shoes;
    const shoe = getRandom(matchingShoes);

    currentOutfit = { top, outerwear, bottom, shoes: shoe };
}

function renderMannequin() {
    if (!currentOutfit) {
        document.getElementById('closet-stage').classList.remove('open');
        return;
    }

    const topLayer = document.getElementById('layer-top');
    const outerwearLayer = document.getElementById('layer-outerwear');
    const bottomLayer = document.getElementById('layer-bottom');
    const shoeLayer = document.getElementById('layer-shoes');
    const topGroup = document.querySelector('.top-group');

    // Asignar imágenes (si isFlipped es true, usar imgBack si existe)
    topLayer.style.backgroundImage = `url(${isFlipped && currentOutfit.top.imgBack ? currentOutfit.top.imgBack : currentOutfit.top.imgFront})`;
    
    if (currentOutfit.outerwear) {
        outerwearLayer.style.backgroundImage = `url(${isFlipped && currentOutfit.outerwear.imgBack ? currentOutfit.outerwear.imgBack : currentOutfit.outerwear.imgFront})`;
        topGroup.classList.add('has-outerwear');
    } else {
        outerwearLayer.style.backgroundImage = 'none';
        topGroup.classList.remove('has-outerwear');
    }

    bottomLayer.style.backgroundImage = `url(${isFlipped && currentOutfit.bottom.imgBack ? currentOutfit.bottom.imgBack : currentOutfit.bottom.imgFront})`;
    
    // Los zapatos no tienen espalda, así que usamos la misma imagen y la volteamos con CSS
    shoeLayer.style.backgroundImage = `url(${currentOutfit.shoes.imgFront})`;
    if (isFlipped) {
        shoeLayer.classList.add('mirrored');
    } else {
        shoeLayer.classList.remove('mirrored');
    }

    // Abrir el armario al terminar de cargar el outfit
    document.getElementById('closet-stage').classList.add('open');
}


// ======== Voltear Maniquí ========
document.getElementById('toggle-view-btn').addEventListener('click', () => {
    if (!currentOutfit) return;
    isFlipped = !isFlipped;
    
    const wrapper = document.getElementById('mannequin');
    
    // Efecto 3D simple
    if (isFlipped) {
        wrapper.style.transform = 'rotateY(180deg)';
        // Cuando dé la vuelta visualmente (mitad de la animación), cambiamos las fotos
        setTimeout(() => {
            wrapper.style.transform = 'rotateY(0deg)'; // Lo devolvemos pero con las fotos cambiadas para simular el giro completo
            renderMannequin();
        }, 300);
    } else {
        wrapper.style.transform = 'rotateY(-180deg)';
        setTimeout(() => {
            wrapper.style.transform = 'rotateY(0deg)';
            renderMannequin();
        }, 300);
    }
});

// Inicializar DB al cargar la página
window.onload = async () => {
    await initDB();
    await loadWardrobe();
};

// ======== Selección Manual ========
let manualSelection = { top: null, outerwear: null, bottom: null, shoes: null };

function openManualModal(tops, outerwears, bottoms, shoes) {
    const modal = document.getElementById('manual-modal');
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    manualSelection = { top: null, outerwear: null, bottom: null, shoes: null };
    document.getElementById('apply-manual-btn').disabled = true;

    renderPicker('picker-tops', tops, 'top');
    renderPicker('picker-outerwears', outerwears, 'outerwear', true); // true indica que es opcional
    renderPicker('picker-bottoms', bottoms, 'bottom');
    renderPicker('picker-shoes', shoes, 'shoes');
}

document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.getElementById('manual-modal').classList.add('hidden');
    document.body.classList.remove('modal-open');
});

function renderPicker(containerId, items, category, isOptional = false) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    // Si es opcional, añadir un botón de "Ninguno"
    if (isOptional) {
        const divNone = document.createElement('div');
        divNone.className = 'picker-item selected'; // Seleccionado por defecto
        divNone.style.background = 'rgba(255,255,255,0.1)';
        divNone.innerHTML = `<span style="font-size: 0.8rem; font-weight: bold;">Ninguno</span>`;
        divNone.addEventListener('click', () => {
            container.querySelectorAll('.picker-item').forEach(el => el.classList.remove('selected'));
            divNone.classList.add('selected');
            manualSelection[category] = null;
            checkManualComplete();
        });
        container.appendChild(divNone);
    }

    if (items.length === 0 && !isOptional) {
        container.innerHTML = '<p class="empty-msg" style="padding-left: 1rem;">No tienes prendas de este tipo.</p>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'picker-item';
        div.style.background = getTazoBackground(item.category, item.style);
        div.innerHTML = `<img src="${item.imgFront}" alt="${item.name}">`;
        div.title = item.name;
        
        div.addEventListener('click', () => {
            if (div.classList.contains('selected')) {
                div.classList.remove('selected');
                manualSelection[category] = null;
            } else {
                container.querySelectorAll('.picker-item').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                manualSelection[category] = item;
            }
            checkManualComplete();
        });
        container.appendChild(div);
    });
}

function checkManualComplete() {
    const btn = document.getElementById('apply-manual-btn');
    if (manualSelection.top && manualSelection.bottom && manualSelection.shoes) {
        btn.disabled = false;
    }
}

document.getElementById('apply-manual-btn').addEventListener('click', () => {
    document.getElementById('manual-modal').classList.add('hidden');
    document.body.classList.remove('modal-open');
    currentOutfit = { ...manualSelection };
    isFlipped = false;
    
    const btn = document.getElementById('generate-btn');
    document.getElementById('mannequin').classList.add('generating');
    btn.disabled = true;
    
    setTimeout(() => {
        document.getElementById('mannequin').classList.remove('generating');
        btn.disabled = false;
        renderMannequin();
    }, 500);
});

// ======== Lógica del Cajón (Tu Colección) ========
document.addEventListener('DOMContentLoaded', () => {
    const drawerHandleBtn = document.getElementById('drawer-handle-btn');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const collectionDrawer = document.getElementById('collection-drawer');
    
    if (drawerHandleBtn && collectionDrawer) {
        drawerHandleBtn.addEventListener('click', () => {
            collectionDrawer.classList.add('open');
        });
    }
    
    if (closeDrawerBtn && collectionDrawer) {
        closeDrawerBtn.addEventListener('click', () => {
            collectionDrawer.classList.remove('open');
        });
    }
});
