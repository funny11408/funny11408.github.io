document.addEventListener('DOMContentLoaded', async () => {
    // --- Default Data ---
    const DEFAULT_DATA = {
        books: [
            {
                title: "示例文章: 荷塘月色",
                fileName: 'sample.txt',
                type: 'text/plain',
                content: new TextEncoder().encode(`开始
第1章 荷塘月色
这几天心里颇不宁静。今晚在院子里坐着乘凉，忽然想起日日走过的荷塘，在这满月的光里，总该另有一番样子吧。月亮渐渐地升高了，墙外马路上孩子们的欢笑，已经听不见了；妻在屋里拍着润儿，迷迷糊糊地哼着眠歌。我悄悄地披了大衫，带上门出去。

沿着荷塘，是一条曲折的小煤屑路。这是一条幽僻的路；白天也少人走，夜晚更加寂寞。荷塘四面，长着许多树，蓊蓊郁郁的。路的一旁，是些杨柳，和一些不知道名字的树。没有月光的晚上，这路上阴森森的，有些怕人。今晚却很好，虽然月光也还是淡淡的。

路上只我一个人，背着手踱着。这一片天地好像是我的；我也像超出了平常的自己，到了另一世界里。我爱热闹，也爱冷静；爱群居，也爱独处。像今晚上，一个人在这苍茫的月下，什么都可以想，什么都可以不想，便觉是个自由的人。白天里一定要做的事，一定要说的话，现在都可不理。这是独处的妙处，我且受用这无边的荷塘月色好了。

曲曲折折的荷塘上面，望去田田的叶子。叶子出水很高，像亭亭的舞女的裙。层层的叶子中间，零星地点缀着些白花，有袅娜地开着的，有羞涩地打着朵儿的；正如一粒粒的明珠，又如碧天里的星星，又如刚出浴的美人。微风过处，送来缕缕清香，仿佛远处高楼上渺茫的歌声似的。这时候叶子与花也有一丝的颤动，像闪电般，霎时传过荷塘的那边去了。叶子本是肩并肩密密地挨着，这便宛然有了一道凝碧的波痕。叶子底下是脉脉的流水，遮住了，不能见一些颜色；而叶子却更见风致了。`).buffer,
                lastRead: Date.now()
            }
        ],
        posts: [
            {
                id: 'welcome-post',
                title: '欢迎使用悦读 (Minimalist Reader)',
                content: '欢迎来到您的私人阅读空间。\n\n这里没有繁杂的干扰，只有纯粹的文字。您可以点击"书城"页面的"+"号导入您的 TXT 或 PDF 书籍。\n\n所有的书籍都存储在您的浏览器本地数据库中，不会上传到云端，保护您的隐私。\n\n祝您阅读愉快！',
                date: new Date().toLocaleDateString()
            }
        ]
    };

    // --- IndexedDB Helper ---
    const ReaderDB = {
        dbName: 'ReaderDB',
        version: 1,
        db: null,

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('files')) {
                        db.createObjectStore('files', { keyPath: 'fileName' });
                    }
                };

                request.onsuccess = async (e) => {
                    this.db = e.target.result;
                    console.log('IndexedDB initialized');

                    // Auto-load defaults if empty
                    try {
                        const count = await this.countFiles();
                        if (count === 0) {
                            console.log('Initializing default books...');
                            for (const book of DEFAULT_DATA.books) {
                                await this.saveFile(book);
                            }
                        }
                    } catch (err) {
                        console.warn('Error loading defaults:', err);
                    }

                    resolve(this.db);
                };

                request.onerror = (e) => {
                    console.error('IndexedDB error:', e.target.error);
                    reject(e.target.error);
                };
            });
        },

        async countFiles() {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['files'], 'readonly');
                const store = transaction.objectStore('files');
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => reject(e.target.error);
            });
        },

        async saveFile(fileData) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['files'], 'readwrite');
                const store = transaction.objectStore('files');
                const request = store.put(fileData);

                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e.target.error);
            });
        },

        async getAllFiles() {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['files'], 'readonly');
                const store = transaction.objectStore('files');
                const request = store.getAll();

                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e.target.error);
            });
        },

        async getFile(fileName) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['files'], 'readonly');
                const store = transaction.objectStore('files');
                const request = store.get(fileName);

                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e.target.error);
            });
        },

        async deleteFile(fileName) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['files'], 'readwrite');
                const store = transaction.objectStore('files');
                const request = store.delete(fileName);

                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e.target.error);
            });
        }
    };

    // Initialize DB then render
    await ReaderDB.init();
    initBlogDefaults();
    renderLibrary();

    function initBlogDefaults() {
        if (!localStorage.getItem('reader_blog_posts')) {
            localStorage.setItem('reader_blog_posts', JSON.stringify(DEFAULT_DATA.posts));
        }
    }

    // --- State & Navigation ---
    const views = {
        bookstore: document.getElementById('bookstore-view'),
        blog: document.getElementById('blog-view'),
        reader: document.getElementById('reader-view')
    };

    const navBtns = document.querySelectorAll('.nav-btn');

    function switchView(viewName) {
        Object.values(views).forEach(el => el.classList.remove('active', 'hidden'));
        Object.values(views).forEach(el => el.classList.add('hidden'));

        if (views[viewName]) {
            views[viewName].classList.remove('hidden');
            views[viewName].classList.add('active');
        }

        navBtns.forEach(btn => {
            if (btn.dataset.target === `${viewName}-view`) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        if (viewName === 'bookstore') renderLibrary();
        if (viewName === 'blog') renderBlogList(); // Default to list
        if (viewName !== 'reader') {
            document.getElementById('sidebar').classList.remove('open');
        }
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target.replace('-view', '');
            switchView(target);
        });
    });

    document.getElementById('back-home-btn').addEventListener('click', () => switchView('bookstore'));


    // --- Bookstore & Library Logic ---
    const bookGrid = document.getElementById('book-grid');
    const uploadCard = document.getElementById('upload-card');
    const fileInput = document.getElementById('file-input');
    // Sample book card removed (auto-loaded)

    uploadCard.addEventListener('click', () => fileInput.click());

    function handleFileUpload(file) {
        const fileReader = new FileReader();
        fileReader.onload = async (e) => {
            const arrayBuffer = e.target.result;

            // Prepare data for DB
            const fileData = {
                fileName: file.name,
                title: file.name.replace(/\.(txt|pdf)$/i, ''),
                type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain'),
                content: arrayBuffer, // Save raw buffer
                lastRead: Date.now()
            };

            try {
                await ReaderDB.saveFile(fileData);
                if (file.name.endsWith('.pdf')) {
                    loadPdfBook(fileData);
                } else {
                    const text = decodeText(arrayBuffer);
                    loadBook({ ...fileData, content: text });
                }
            } catch (error) {
                console.error('Save failed', error);
                alert('保存文件失败，可能是存储空间不足。');
            }
        };
        fileReader.readAsArrayBuffer(file);
    }

    function decodeText(arrayBuffer) {
        const uint8Array = new Uint8Array(arrayBuffer);
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        try {
            return utf8Decoder.decode(uint8Array);
        } catch (e) {
            console.log('UTF-8 decode failed, trying GBK');
            const gbkDecoder = new TextDecoder('gbk', { fatal: false });
            return gbkDecoder.decode(uint8Array);
        }
    }

    async function loadPdfBook(fileData) {
        switchView('reader');
        navBookTitle.textContent = fileData.title + ' (Loading...)';
        readerContent.innerHTML = '<div class="loading-indicator">正在加载 PDF...</div>';
        tocList.innerHTML = ''; // clear TOC
        currentBookFileName = fileData.fileName; // Set current

        try {
            // content from DB is ArrayBuffer
            const data = fileData.content;
            const pdf = await pdfjsLib.getDocument({ data: data }).promise;

            navBookTitle.textContent = fileData.title;
            readerContent.innerHTML = ''; // Clear loading

            // Update last read
            fileData.lastRead = Date.now();
            ReaderDB.saveFile(fileData);

            // 1. Render All Pages (Visual)
            // Note: For very large PDFs, lazy loading is better. For now, render all.
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);

                // Use higher scale for sharper text on HiDPI screens
                // 3.0 is usually sufficient for most screens
                const scale = 3.0;
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.id = `page-${i}`; // Navigation anchor

                // Style for responsiveness
                // We calculate the display width based on the viewport width at scale=1 (approx)
                // or just let CSS handle 100% width, but we need to limit max-width so it doesn't blow up
                // The canvas internal resolution is high (scale 3), CSS scales it down to fit container
                canvas.style.width = '100%';
                canvas.style.height = 'auto';

                readerContent.appendChild(canvas);

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                await page.render(renderContext).promise;
            }

            // Restore progress for PDF
            if (fileData.progress) {
                // Small delay to ensure layout is settled
                setTimeout(() => {
                    readerContent.scrollTop = fileData.progress;
                }, 100);
            } else {
                readerContent.scrollTop = 0;
            }

            // 2. Build TOC (Outline)
            const outline = await pdf.getOutline();
            tocList.innerHTML = '';

            if (outline && outline.length > 0) {
                outline.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'toc-item';
                    div.textContent = item.title;
                    div.onclick = async () => {
                        try {
                            let dest = item.dest;
                            if (typeof dest === 'string') {
                                dest = await pdf.getDestination(dest);
                            }
                            if (Array.isArray(dest)) {
                                // The first element is the page ref
                                const ref = dest[0];
                                const pageIndex = await pdf.getPageIndex(ref);
                                // Scroll to page (pageIndex + 1 because our IDs are 1-based)
                                const pageId = `page-${pageIndex + 1}`;
                                const pageEl = document.getElementById(pageId);
                                if (pageEl) {
                                    pageEl.scrollIntoView({ behavior: 'smooth' });
                                    if (window.innerWidth < 800) sidebar.classList.remove('open');
                                }
                            }
                        } catch (err) {
                            console.error('TOC navigation failed:', err);
                        }
                    };
                    tocList.appendChild(div);
                });
            } else {
                // Fallback TOC: Page 1, Page 2...
                for (let i = 1; i <= pdf.numPages; i++) {
                    const div = document.createElement('div');
                    div.className = 'toc-item';
                    div.textContent = `第 ${i} 页`;
                    div.onclick = () => {
                        document.getElementById(`page-${i}`).scrollIntoView({ behavior: 'smooth' });
                        if (window.innerWidth < 800) sidebar.classList.remove('open');
                    };
                    tocList.appendChild(div);
                }
            }

        } catch (error) {
            console.error(error);
            alert('PDF 加载失败: ' + error.message);
            switchView('bookstore');
        }
    }

    async function renderLibrary() {
        const dynamicCards = document.querySelectorAll('.book-card.dynamic-book');
        dynamicCards.forEach(c => c.remove());

        const library = await ReaderDB.getAllFiles();
        // Sort by lastRead desc
        library.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));

        library.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card dynamic-book';
            card.innerHTML = `
                <div class="delete-book-btn" title="删除">×</div>
                <div class="book-cover" style="background-color: #f7f5f0; color: #8c8270; font-size: 2rem;">
                    ${book.title.substring(0, 1)}
                </div>
                <div class="card-title">${book.title}</div>
                <div class="card-meta">已保存 (IndexedDB)</div>
            `;

            // Open Book
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-book-btn')) return;

                if (book.fileName.endsWith('.pdf')) {
                    loadPdfBook(book);
                } else {
                    const text = decodeText(book.content);
                    loadBook({ ...book, content: text });
                }
            });

            // Delete Book
            card.querySelector('.delete-book-btn').addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent card click
                if (confirm(`确定要删除 "${book.title}" 吗？`)) {
                    await ReaderDB.deleteFile(book.fileName);
                    renderLibrary(); // Re-render
                }
            });

            bookGrid.appendChild(card);
        });
    }

    // --- Blog Logic ---
    const blogEditor = document.getElementById('blog-editor');
    const newPostBtn = document.getElementById('new-post-btn');
    const cancelPostBtn = document.getElementById('cancel-post-btn');
    const savePostBtn = document.getElementById('save-post-btn');
    const blogFeed = document.getElementById('blog-feed');
    const titleInput = document.getElementById('post-title-input');
    const contentInput = document.getElementById('post-content-input');

    // State for editing
    let editingPostId = null;

    newPostBtn.addEventListener('click', () => {
        editingPostId = null; // Clear edit mode
        titleInput.value = '';
        contentInput.value = '';
        blogFeed.classList.add('hidden');
        blogEditor.classList.remove('hidden');
        titleInput.focus();
    });

    cancelPostBtn.addEventListener('click', () => {
        blogEditor.classList.add('hidden');
        blogFeed.classList.remove('hidden');
        editingPostId = null;
    });

    savePostBtn.addEventListener('click', () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        if (!title || !content) return;

        let posts = JSON.parse(localStorage.getItem('reader_blog_posts') || '[]');

        if (editingPostId) {
            // Update existing
            const index = posts.findIndex(p => p.id === editingPostId);
            if (index !== -1) {
                posts[index].title = title;
                posts[index].content = content;
                // Optional: posts[index].date = new Date().toLocaleDateString(); // Update date?
            }
        } else {
            // Create new
            posts.unshift({ id: Date.now(), title, content, date: new Date().toLocaleDateString() });
        }

        localStorage.setItem('reader_blog_posts', JSON.stringify(posts));

        titleInput.value = '';
        contentInput.value = '';
        editingPostId = null;
        blogEditor.classList.add('hidden');
        blogFeed.classList.remove('hidden');
        // If we were editing, return to detail view? Or list? Let's go to list for simplicity.
        renderBlogList();
    });

    function renderBlogList() {
        // Clear previous view
        blogFeed.className = 'blog-feed';
        blogFeed.innerHTML = '';

        const posts = JSON.parse(localStorage.getItem('reader_blog_posts') || '[]');

        if (posts.length === 0) {
            blogFeed.innerHTML = '<div style="text-align:center;color:#999;margin-top:2rem;">暂无文章，点击右上角"写博文"开始创作</div>';
            return;
        }

        const listContainer = document.createElement('div');
        listContainer.className = 'blog-list';

        posts.forEach(post => {
            const el = document.createElement('div');
            el.className = 'post-item-summary';
            el.innerHTML = `
                <div class="post-summary-title">${post.title}</div>
                <div class="post-summary-date">${post.date}</div>
            `;
            el.addEventListener('click', () => renderBlogPost(post));
            listContainer.appendChild(el);
        });
        blogFeed.appendChild(listContainer);
    }

    function renderBlogPost(post) {
        blogFeed.className = 'blog-feed-detail';
        blogFeed.innerHTML = `
            <div class="blog-detail-actions">
                <button class="btn-secondary" id="back-list-btn">← 返回列表</button>
            </div>
            <article class="blog-article">
                <h1 class="article-title">${post.title}</h1>
                <div class="blog-detail-meta">
                    ${post.date}
                    <div style="float:right;">
                        <button class="btn-secondary" id="edit-post-btn" style="font-size:0.8rem; padding: 0.2rem 0.5rem; margin-right: 0.5rem;">编辑</button>
                        <button class="delete-btn-corner" id="delete-post-btn">删除</button>
                    </div>
                </div>
                <div class="article-content">${post.content.replace(/\n/g, '<br>')}</div>
            </article>
        `;

        document.getElementById('back-list-btn').addEventListener('click', () => {
            renderBlogList();
        });

        document.getElementById('edit-post-btn').addEventListener('click', () => {
            editingPostId = post.id;
            titleInput.value = post.title;
            contentInput.value = post.content;
            blogFeed.classList.add('hidden');
            blogEditor.classList.remove('hidden');
        });

        document.getElementById('delete-post-btn').addEventListener('click', () => {
            if (confirm('确定删除?')) {
                let posts = JSON.parse(localStorage.getItem('reader_blog_posts') || '[]');
                posts = posts.filter(p => p.id !== post.id);
                localStorage.setItem('reader_blog_posts', JSON.stringify(posts));
                renderBlogList();
            }
        });
    }

    // --- Text Reader Logic (Same Improved) ---
    const readerContent = document.getElementById('reader-content');
    const navBookTitle = document.getElementById('nav-book-title');
    const sidebar = document.getElementById('sidebar');
    const tocList = document.getElementById('toc-list');
    const saveProgressBtn = document.getElementById('save-progress-btn');

    let currentBookFileName = null; // Track current book

    document.getElementById('toggle-sidebar-btn').addEventListener('click', () => sidebar.classList.toggle('open'));
    document.getElementById('close-sidebar-btn').addEventListener('click', () => sidebar.classList.remove('open'));

    // Save Progress Handler
    saveProgressBtn.addEventListener('click', async () => {
        if (!currentBookFileName) return;

        try {
            const fileData = await ReaderDB.getFile(currentBookFileName);
            if (fileData) {
                fileData.progress = readerContent.scrollTop;
                fileData.lastRead = Date.now();
                await ReaderDB.saveFile(fileData);

                // Visual feedback
                const originalText = saveProgressBtn.textContent;
                saveProgressBtn.textContent = "已保存!";
                setTimeout(() => saveProgressBtn.textContent = originalText, 1500);
            }
        } catch (e) {
            console.error(e);
            alert('保存进度失败');
        }
    });

    async function loadBook(bookData) {
        switchView('reader');
        navBookTitle.innerText = bookData.title;
        currentBookFileName = bookData.fileName; // Set current

        // Update last read of text book
        bookData.lastRead = Date.now();
        if (bookData.fileName !== 'sample.txt') {
            ReaderDB.saveFile(bookData);
        }

        let cleanText = bookData.content.replace(/\r\n/g, '\n');
        const chapterRegex = /(?:^|\n)\s*((?:第[0-9一二三四五六七八九十百千]+[章回卷集部]|Chapter\s?\d+|Section\s?\d+)\s?.*)/g;
        const matches = [...cleanText.matchAll(chapterRegex)];
        let currentChapters = [];
        if (matches.length > 0) {
            if (matches[0].index > 0) currentChapters.push({ title: '开始', content: cleanText.substring(0, matches[0].index), id: 'chapter-0' });
            for (let i = 0; i < matches.length; i++) {
                const next = (i === matches.length - 1) ? cleanText.length : matches[i + 1].index;
                const body = cleanText.substring(matches[i].index, next);
                const lines = body.split('\n');
                currentChapters.push({ title: lines[0].trim(), content: lines.slice(1).join('\n'), id: `ch-${i + 1}` });
            }
        } else {
            // Pagination Fallback
            const pageSize = 5000;
            const pages = Math.ceil(cleanText.length / pageSize);
            for (let i = 0; i < pages; i++) {
                currentChapters.push({ title: `第 ${i + 1} 页`, content: cleanText.substring(i * pageSize, (i + 1) * pageSize), id: `p-${i}` });
            }
        }

        readerContent.innerHTML = '';
        tocList.innerHTML = '';
        currentChapters.forEach(ch => {
            const div = document.createElement('div');
            div.id = ch.id;
            if (ch.title) { const h = document.createElement('h2'); h.className = 'chapter-title-render'; h.innerText = ch.title; div.appendChild(h); }
            const pDiv = document.createElement('div');
            pDiv.innerHTML = ch.content.split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('');
            div.appendChild(pDiv);
            readerContent.appendChild(div);

            const item = document.createElement('div');
            item.className = 'toc-item';
            item.innerText = ch.title;
            item.onclick = () => { document.getElementById(ch.id).scrollIntoView({ behavior: 'smooth' }); sidebar.classList.remove('open'); };
            tocList.appendChild(item);
        });

        // Restore progress
        if (bookData.progress) {
            readerContent.scrollTop = bookData.progress;
        } else {
            readerContent.scrollTop = 0;
        }
    }

    // Init will be handled by await ReaderDB.init(); at top
});
