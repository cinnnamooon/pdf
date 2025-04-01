const pdfjsLib = window['pdfjs-dist/build/pdf'];

async function renderPDF(file, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; 

    const fileReader = new FileReader();
    fileReader.onload = async function () {
        const typedArray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedArray).promise;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: 1.5 });

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const pageContainer = document.createElement('div');
            pageContainer.style.position = 'relative';
            pageContainer.style.width = `${canvas.width}px`;
            pageContainer.style.height = `${canvas.height}px`;
            pageContainer.style.margin = '0 auto'; 
            pageContainer.style.marginBottom = '10px';
            container.appendChild(pageContainer);

            // Base canvas
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            pageContainer.appendChild(canvas);

            await page.render({ canvasContext: context, viewport }).promise;

            // Add overlay for annotations
            const overlay = document.createElement('canvas');
            overlay.className = 'annotation-layer';
            overlay.width = canvas.width;
            overlay.height = canvas.height;
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.zIndex = '2';
            pageContainer.appendChild(overlay);

            enableHighlighting(overlay);

            // Add text layer for selectable text
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'text-layer';
            textLayerDiv.style.position = 'absolute';
            textLayerDiv.style.top = '0';
            textLayerDiv.style.left = '0';
            textLayerDiv.style.height = `${canvas.height}px`;
            textLayerDiv.style.width = `${canvas.width}px`;
            textLayerDiv.style.zIndex = '1';
            pageContainer.appendChild(textLayerDiv);

            const textContent = await page.getTextContent();
            pdfjsLib.renderTextLayer({
                textContent,
                container: textLayerDiv,
                viewport,
                textDivs: []
            });
        }
    };
    fileReader.readAsArrayBuffer(file);
}

function updateStatusBox(text) {
    const statusBox = document.getElementById('statusBox');
    statusBox.textContent = text;
}

function enableHighlighting(overlay) {
    const context = overlay.getContext('2d');
    let isDrawing = false;
    let startX, startY;

    overlay.addEventListener('mousedown', (event) => {
        isDrawing = true;
        const rect = overlay.getBoundingClientRect();
        startX = event.clientX - rect.left;
        startY = event.clientY - rect.top;
    });

    overlay.addEventListener('mousemove', (event) => {
        if (!isDrawing) return;
        const rect = overlay.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;

        context.clearRect(0, 0, overlay.width, overlay.height);
        context.fillStyle = 'rgba(255, 255, 0, 0.5)';
        context.fillRect(startX, startY, currentX - startX, currentY - startY);
        
        updateStatusBox(`Rectangle drawn: ${Math.abs(currentX - startX)}px × ${Math.abs(currentY - startY)}px`);
    });

    overlay.addEventListener('mouseup', () => {
        isDrawing = false;
    });

    overlay.addEventListener('mouseleave', () => {
        isDrawing = false;
    });
}

function extractNumericalData(text) {
    const numbers = text.match(/[-+]?\d*\.?\d+%?/g);
    return numbers ? numbers.join(' ') : '';
}

function findMatchingText(searchText, containerId) {
    const container = document.getElementById(containerId);
    const textLayers = container.getElementsByClassName('text-layer');
    const matches = [];

    for (const textLayer of textLayers) {
        const textDivs = textLayer.getElementsByTagName('span');
        for (const div of textDivs) {
            if (div.textContent.includes(searchText)) {
                const range = document.createRange();
                range.selectNode(div);
                matches.push({
                    range: range,
                    textLayer: textLayer
                });
            }
        }
    }
    return matches;
}

function highlightMatches(matches, container) {
    if (!matches.length) return;

    const pageContainer = matches[0].textLayer.parentElement;
    const highlightCanvas = pageContainer.querySelector('.annotation-layer');
    const context = highlightCanvas.getContext('2d');
    const pageRect = pageContainer.getBoundingClientRect();

    context.fillStyle = 'rgba(255, 255, 0, 0.5)';
    
    matches.forEach(match => {
        const rects = match.range.getClientRects();
        for (const rect of rects) {
            context.fillRect(
                rect.left - pageRect.left,
                rect.top - pageRect.top,
                rect.width,
                rect.height
            );
        }
    });
}

function clearAllHighlights() {
    const containers = ['pdfViewerLeft', 'pdfViewerRight'];
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        const highlightLayers = container.getElementsByClassName('annotation-layer');
        Array.from(highlightLayers).forEach(canvas => {
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);
        });
    });
}

function highlightSelectedText() {
    clearAllHighlights();
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const selectedText = selection.toString();
        const numericData = extractNumericalData(selectedText);
        const rects = range.getClientRects();
        const container = range.commonAncestorContainer;

        const textLayerDiv = container.closest('.text-layer');
        if (textLayerDiv) {
            const highlightCanvas = textLayerDiv.previousElementSibling;
            const context = highlightCanvas.getContext('2d');
            const pageContainer = textLayerDiv.parentElement;
            const pageRect = pageContainer.getBoundingClientRect();

            context.fillStyle = 'rgba(255, 255, 0, 0.5)';
            
            for (const rect of rects) {
                context.fillRect(
                    rect.left - pageRect.left,
                    rect.top - pageRect.top,
                    rect.width,
                    rect.height
                );
            }

            if (numericData) {
                const leftMatches = findMatchingText(numericData, 'pdfViewerLeft');
                
                highlightMatches(leftMatches, 'pdfViewerLeft');
                
                const totalMatches = leftMatches.length
                updateStatusBox(`Found ${totalMatches} matches for "${numericData}"`);
            } else {
                updateStatusBox(`Selected data: "${numericData}"`);
            }
            
            selection.removeAllRanges();
        }
    }
}

document.getElementById('highlightButton').addEventListener('click', highlightSelectedText);

document.getElementById('pdfUploadLeft').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        renderPDF(file, 'pdfViewerLeft');
    }
});

document.getElementById('pdfUploadRight').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        renderPDF(file, 'pdfViewerRight');
    }
});
