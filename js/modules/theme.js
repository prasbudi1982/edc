// theme.js - Module tema global POS EDC PRO
// Ditambahkan tanpa ubah module lain

export const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem('edc_theme') || 'dark';
        const savedAccent = localStorage.getItem('edc_accent') || '#2563eb';
        // accent dulu baru theme, biar tidak ke-reset
        this.applyAccent(savedAccent);
        this.applyTheme(savedTheme);
        // double apply biar light theme tidak timpa
        setTimeout(() => this.applyAccent(savedAccent), 50);
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
            if ((localStorage.getItem('edc_theme') || 'dark') === 'auto') {
                this.applyTheme('auto');
            }
        });
    },
    applyTheme(theme) {
        const body = document.body;
        const html = document.documentElement;
        body.classList.remove('theme-dark','theme-light');
        if (theme === 'auto') {
            const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
            body.classList.add(isLight ? 'theme-light' : 'theme-dark');
            html.style.colorScheme = isLight ? 'light' : 'dark';
            body.setAttribute('data-theme','auto');
        } else if (theme === 'light') {
            body.classList.add('theme-light');
            html.style.colorScheme = 'light';
            body.setAttribute('data-theme','light');
        } else {
            body.classList.add('theme-dark');
            html.style.colorScheme = 'dark';
            body.setAttribute('data-theme','dark');
        }
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = body.classList.contains('theme-light') ? '#ffffff' : '#0f172a';
    },
    applyAccent(color) {
        // FIX: set di :root DAN body, plus important biar tidak ketimpa theme-light
        const root = document.documentElement;
        const body = document.body;
        root.style.setProperty('--accent-color', color, 'important');
        root.style.setProperty('--accent-hover', color, 'important');
        body.style.setProperty('--accent-color', color, 'important');
        body.style.setProperty('--accent-hover', color, 'important');
        // simpan juga untuk fallback color-mix
        try { localStorage.setItem('edc_accent', color); } catch(e){}
    },
    setTheme(theme) {
        localStorage.setItem('edc_theme', theme);
        this.applyTheme(theme);
    },
    setAccent(color) {
        localStorage.setItem('edc_accent', color);
        this.applyAccent(color);
    },
    getTheme() { return localStorage.getItem('edc_theme') || 'dark'; }
};
export default ThemeManager;
