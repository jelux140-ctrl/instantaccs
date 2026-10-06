/* Creed — portal-only: static hex background (no custom cursor / no per-frame grid) */
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('bg-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const hexSize = 30;
        function drawHexGrid() {
            const width = canvas.width = window.innerWidth;
            const height = canvas.height = window.innerHeight;
            ctx.clearRect(0, 0, width, height);
            const rowHeight = hexSize * 1.5;
            const colWidth = hexSize * Math.sqrt(3);
            const rows = Math.ceil(height / rowHeight) + 1;
            const cols = Math.ceil(width / colWidth) + 1;
            ctx.strokeStyle = 'rgba(255, 107, 53, 0.05)';
            ctx.lineWidth = 2;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    let x = c * colWidth;
                    const y = r * rowHeight;
                    if (r % 2 === 1) x += colWidth / 2;
                    ctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 3) * i;
                        const px = x + hexSize * Math.cos(angle);
                        const py = y + hexSize * Math.sin(angle);
                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }
        drawHexGrid();
        window.addEventListener('resize', drawHexGrid);
    }

    const header = document.querySelector('header');
    if (header) {
        if (window.scrollY > 30) header.classList.add('scrolled');
        window.addEventListener('scroll', () => {
            if (window.scrollY > 30) header.classList.add('scrolled');
            else header.classList.remove('scrolled');
        });
    }
});
