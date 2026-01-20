document.addEventListener('DOMContentLoaded', async () => {
    // DEBUG: Global Error Handler
    window.onerror = function (msg, url, line, col, error) {
        alert("发生系统错误:\n" + msg + "\n行号: " + line);
        return false;
    };
    console.log('App starting...');

    // --- Bmob Init ---
    if (typeof Bmob === 'undefined') {
        alert('严重错误: Bmob SDK 加载失败，请检查网络或刷新页面。');
        return;
    }
    // Initialize Bmob with Secret Key and API Safe Code
    Bmob.initialize("5c4b10e2fd2661f6", "111111");

    // DEBUG: Connectivity Test (Temporarily disabled)
    /*
    const testQuery = Bmob.Query('Posts');
    testQuery.limit(1).find().then(res => {
        console.log('Bmob Connection: Success', res);
    }).catch(err => {
        console.error('Bmob Connection Failed:', err);
    });
    */

    // --- 预置书籍列表 ---
    const PRESET_BOOKS = [
        { fileName: 'data_structure.pdf', title: '数据结构与算法', path: 'data_structure.pdf' },
        { fileName: 'machine_learning.pdf', title: '机器学习', path: 'machine_learning.pdf' },
        { fileName: 'deep_learning.pdf', title: '深度学习', path: 'deep_learning.pdf' },
        { fileName: 'ml_explained.pdf', title: '白话机器学习算法', path: 'ml_explained.pdf' }
    ];


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

    // Initialize DB
    await ReaderDB.init();

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

    // 初始加载书架
    renderLibrary();

    uploadCard.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    function handleFileUpload(file) {
        // Visual feedback
        const uploadCardTitle = uploadCard.querySelector('.card-title');
        const originalText = "导入书籍";

        // 0. Pre-check: Size limit (100MB for local storage)
        const contentSize = file.size / 1024 / 1024; // in MB
        if (contentSize > 100) {
            alert('导入失败: 文件过大。建议 100MB 以内，当前文件: ' + contentSize.toFixed(2) + 'MB');
            return;
        }

        uploadCardTitle.textContent = '正在导入...';
        uploadCard.style.pointerEvents = 'none';

        // 纯本地存储模式 - 直接保存到 IndexedDB
        const fileReader = new FileReader();
        fileReader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const fileData = {
                    fileName: file.name,
                    title: file.name.replace(/\.(txt|pdf)$/i, ''),
                    type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain'),
                    content: arrayBuffer,
                    lastRead: Date.now(),
                    progress: 0
                };
                await ReaderDB.saveFile(fileData);

                uploadCardTitle.textContent = originalText;
                uploadCard.style.pointerEvents = 'auto';
                renderLibrary(); // Reload list
                alert('导入成功！书籍已保存到本地。');
            } catch (err) {
                console.error('Save failed', err);
                alert('导入失败: ' + err.message);
                uploadCardTitle.textContent = originalText;
                uploadCard.style.pointerEvents = 'auto';
            }
        };
        fileReader.onerror = () => {
            alert('读取文件失败');
            uploadCardTitle.textContent = originalText;
            uploadCard.style.pointerEvents = 'auto';
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

        // === 1. 显示预置书籍 ===
        PRESET_BOOKS.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card dynamic-book preset-book';
            card.innerHTML = `
                <div class="book-cover" style="background-color: #e8f4f8; color: #5a8a9a; font-size: 2rem;">
                    ${book.title.substring(0, 1)}
                </div>
                <div class="card-title">${book.title}</div>
                <div class="card-meta">📚 预置书籍</div>
            `;

            // 点击打开预置书籍
            card.addEventListener('click', async () => {
                const cardTitle = card.querySelector('.card-title');
                const originalTitle = cardTitle.textContent;

                card.style.opacity = '0.7';
                card.style.pointerEvents = 'none';

                try {
                    // 先检查本地缓存
                    let localData = await ReaderDB.getFile(book.fileName);

                    if (!localData) {
                        // 从服务器下载到本地缓存
                        cardTitle.textContent = '下载中...';
                        console.log('Downloading preset book:', book.path);

                        // 添加超时处理 (2分钟)
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 120000);

                        try {
                            const response = await fetch(book.path, { signal: controller.signal });
                            clearTimeout(timeoutId);

                            if (!response.ok) throw new Error('HTTP ' + response.status);

                            cardTitle.textContent = '处理中...';
                            const arrayBuffer = await response.arrayBuffer();

                            localData = {
                                fileName: book.fileName,
                                title: book.title,
                                type: 'application/pdf',
                                content: arrayBuffer,
                                lastRead: Date.now(),
                                progress: 0,
                                isPreset: true
                            };
                            await ReaderDB.saveFile(localData);
                        } catch (fetchErr) {
                            if (fetchErr.name === 'AbortError') {
                                throw new Error('下载超时，请检查网络后重试');
                            }
                            throw fetchErr;
                        }
                    }

                    // 加载 PDF
                    loadPdfBook(localData);
                } catch (err) {
                    console.error(err);
                    alert('打开书籍失败: ' + err.message);
                    cardTitle.textContent = originalTitle;
                } finally {
                    card.style.opacity = '1';
                    card.style.pointerEvents = 'auto';
                }
            });

            bookGrid.appendChild(card);
        });

        // === 2. 显示用户导入的本地书籍 ===
        try {
            const books = await ReaderDB.getAllFiles();

            // 过滤掉预置书籍，只显示用户导入的
            const presetFileNames = PRESET_BOOKS.map(b => b.fileName);
            const userBooks = books.filter(b => !presetFileNames.includes(b.fileName) && !b.isPreset);

            // 按最后阅读时间排序
            userBooks.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));

            userBooks.forEach(book => {
                const card = document.createElement('div');
                card.className = 'book-card dynamic-book';
                card.innerHTML = `
                    <div class="delete-book-btn" title="删除">×</div>
                    <div class="book-cover" style="background-color: #f7f5f0; color: #8c8270; font-size: 2rem;">
                        ${book.title ? book.title.substring(0, 1) : '书'}
                    </div>
                    <div class="card-title">${book.title || book.fileName}</div>
                    <div class="card-meta">📖 本地导入</div>
                `;

                // Open Book
                card.addEventListener('click', async (e) => {
                    if (e.target.classList.contains('delete-book-btn')) return;
                    card.style.opacity = '0.5';

                    try {
                        const localData = await ReaderDB.getFile(book.fileName);
                        if (!localData) {
                            alert('书籍文件不存在');
                            renderLibrary();
                            return;
                        }

                        if (localData.fileName.endsWith('.pdf')) {
                            loadPdfBook(localData);
                        } else {
                            const text = decodeText(localData.content);
                            loadBook({ ...localData, content: text });
                        }
                    } catch (err) {
                        alert('打开书籍失败: ' + err.message);
                    } finally {
                        card.style.opacity = '1';
                    }
                });

                // Delete Book
                card.querySelector('.delete-book-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`确定要删除 "${book.title || book.fileName}" 吗？`)) {
                        try {
                            await ReaderDB.deleteFile(book.fileName);
                            renderLibrary();
                        } catch (err) {
                            alert('删除失败: ' + err.message);
                        }
                    }
                });

                bookGrid.appendChild(card);
            });

        } catch (err) {
            console.error('读取书籍列表失败', err);
        }
    }

    // --- Blog Logic ---
    const blogEditor = document.getElementById('blog-editor');
    const newPostBtn = document.getElementById('new-post-btn');
    const cancelPostBtn = document.getElementById('cancel-post-btn');
    const savePostBtn = document.getElementById('save-post-btn');
    const blogFeed = document.getElementById('blog-feed');
    const titleInput = document.getElementById('post-title-input');
    const contentInput = document.getElementById('post-content-input');
    const blogImageInput = document.getElementById('blog-image-input');
    const btnInsertImg = document.getElementById('btn-insert-img');
    const btnInsertTable = document.getElementById('btn-insert-table');

    // Toolbar Logic
    btnInsertTable.addEventListener('click', () => {
        const tableTemplate = `\n| 表头1 | 表头2 |\n| --- | --- |\n| 内容1 | 内容2 |\n`;
        const start = contentInput.selectionStart;
        const end = contentInput.selectionEnd;
        const text = contentInput.value;
        contentInput.value = text.substring(0, start) + tableTemplate + text.substring(end);
    });

    btnInsertImg.addEventListener('click', () => {
        blogImageInput.click();
    });

    // Helper for uploading images (used by Button & Paste)
    function uploadAndInsertImage(file) {
        // 1. Size Check (Max 5MB for images)
        if (file.size > 5 * 1024 * 1024) {
            alert('图片过大 (超过5MB)，请压缩后上传。');
            return;
        }

        const originalText = btnInsertImg.textContent;
        btnInsertImg.textContent = '上传中...';
        btnInsertImg.disabled = true;

        // Insert placeholder
        const placeholder = `![上传中...](loading)`;
        const start = contentInput.selectionStart;
        const end = contentInput.selectionEnd;
        const text = contentInput.value;
        contentInput.value = text.substring(0, start) + placeholder + text.substring(end);

        // Move cursor after placeholder
        const newCursorPos = start + placeholder.length;
        contentInput.setSelectionRange(newCursorPos, newCursorPos);

        const safeName = "blog_" + Date.now() + "_" + (file.name ? file.name.replace(/[^\w\.\-\u4e00-\u9fa5]/g, '_') : 'pasted.png');
        console.log('Preparing upload:', safeName, 'Size:', file.size);

        // Visual Timer
        let seconds = 0;
        let timerId = setInterval(() => {
            seconds++;
            btnInsertImg.textContent = `上传中 (${seconds}s)...`;
            if (seconds >= 60) clearInterval(timerId);
        }, 1000);

        let uploadTask;
        try {
            const bmobFile = Bmob.File(safeName, file);
            uploadTask = bmobFile.save();
            // alert('Step 2: 请求已发送，等待响应...');
        } catch (e) {
            alert('Step 1.5: SDK 初始化失败: ' + e.message);
            contentInput.value = contentInput.value.replace(placeholder, '');
            btnInsertImg.disabled = false;
            btnInsertImg.textContent = originalText;
            return;
        }

        // 3. Create Timeout Promise (60 seconds)
        const timeoutTask = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("上传超时 (60秒)，网络可能较慢")), 60000)
        );

        // 4. Race
        Promise.race([uploadTask, timeoutTask]).then(res => {
            // alert('Step 3: 收到响应!');
            // Result is array [{ filename, group, url }]
            if (!res || !res[0] || !res[0].url) {
                throw new Error("返回数据格式异常: " + JSON.stringify(res));
            }
            const url = res[0].url;
            const imgMarkdown = `![图片描述](${url})`;

            // Replace placeholder with actual markdown
            contentInput.value = contentInput.value.replace(placeholder, imgMarkdown);

            clearInterval(timerId); // Stop timer
            btnInsertImg.textContent = originalText;
            btnInsertImg.disabled = false;
        }).catch(err => {
            clearInterval(timerId); // Stop timer
            console.error('Upload failed:', err);

            let msg = err.message || JSON.stringify(err);
            if (msg.includes('60秒')) {
                msg += '\n\n【排查建议】\n1. 您的网络可能连接 Bmob 文件服务器已断开。\n2. 请尝试连接手机热点。\n3. 您也可以点击“再试一次”。';
            }
            alert('上传失败: ' + msg);

            // Remove placeholder on failure
            contentInput.value = contentInput.value.replace(placeholder, '');
            btnInsertImg.textContent = originalText;
            btnInsertImg.disabled = false;
        });
    }

    blogImageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadAndInsertImage(e.target.files[0]);
        }
    });

    // Paste Support (Ctrl+V)
    contentInput.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                uploadAndInsertImage(blob);
                e.preventDefault(); // Prevent default paste behavior for files
            }
        }
    });

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

    savePostBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        if (!title || !content) return;

        // Visual feedback
        savePostBtn.textContent = '发布中...';
        savePostBtn.disabled = true;

        try {
            const query = Bmob.Query('Posts');

            if (editingPostId) {
                // Update existing
                const post = await query.get(editingPostId);
                post.set('title', title);
                post.set('content', content);
                await post.save();
            } else {
                // Create new
                query.set("title", title);
                query.set("content", content);
                query.set("date", new Date().toLocaleDateString());
                await query.save();
            }

            titleInput.value = '';
            contentInput.value = '';
            editingPostId = null;
            blogEditor.classList.add('hidden');
            blogFeed.classList.remove('hidden');
            renderBlogList(); // Reload from cloud

        } catch (error) {
            console.error('Bmob save error:', error);
            // Debugging the weird 'undefined' error
            let errorMsg = 'Unknown Error';
            try {
                if (typeof error === 'undefined') errorMsg = 'undefined (literally)';
                else if (error === null) errorMsg = 'null';
                else if (typeof error === 'string') errorMsg = error;
                else if (error.message) errorMsg = error.message;
                else errorMsg = JSON.stringify(error);
            } catch (e) {
                errorMsg = 'Error parsing error: ' + e.message;
            }
            alert('发布失败 (Debug Info):\n' + errorMsg + '\n\n类型: ' + typeof error);
        } finally {
            savePostBtn.textContent = '发布';
            savePostBtn.disabled = false;
        }
    });

    function renderBlogList() {
        // Clear previous view
        blogFeed.className = 'blog-feed';
        blogFeed.innerHTML = '<div class="loading-indicator">加载文章中...</div>';

        const query = Bmob.Query("Posts");
        query.order("-createdAt"); // Newest first
        query.find().then(posts => {
            blogFeed.innerHTML = ''; // Clear loading

            if (posts.length === 0) {
                blogFeed.innerHTML = '<div style="text-align:center;color:#999;margin-top:2rem;">暂无文章，点击右上角"写博文"开始创作 (Bmob Cloud)</div>';
                return;
            }

            const listContainer = document.createElement('div');
            listContainer.className = 'blog-list';

            posts.forEach(post => {
                const el = document.createElement('div');
                el.className = 'post-item-summary';
                el.innerHTML = `
                    <div class="post-summary-title">${post.title}</div>
                    <div class="post-summary-date">${post.date || post.createdAt}</div>
                `;
                el.addEventListener('click', () => {
                    renderBlogPost(post);
                });
                listContainer.appendChild(el);
            });
            blogFeed.appendChild(listContainer);
        }).catch(err => {
            console.error(err);
            // Display actual error for debugging
            blogFeed.innerHTML = `<div style="color:red;text-align:center;padding:1rem;">
                <h3>加载失败 (Load Failed)</h3>
                <p>错误代码 (Code): ${err.code || 'Unknown'}</p>
                <p>错误信息 (Msg): ${err.message || JSON.stringify(err)}</p>
                <p style="font-size:0.8rem;color:#666;">请检查 Bmob 后台的 "应用设置" -> "安全配置" -> "Web安全域名"，确保已添加您的域名 (如 github.io)。</p>
            </div>`;
        });
    }

    function parseMarkdownSafe(content) {
        if (!content) return '';
        try {
            if (typeof marked === 'undefined') {
                return content.replace(/\n/g, '<br>'); // Fallback if library missing
            }
            return marked.parse(content);
        } catch (e) {

            return '<div style="color:red">渲染错误: ' + e.message + '</div>' + content.replace(/\n/g, '<br>');
        }
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
                <div class="article-content markdown-body">${parseMarkdownSafe(post.content)}</div>
            </article>
        `;

        document.getElementById('back-list-btn').addEventListener('click', () => {
            renderBlogList();
        });

        document.getElementById('edit-post-btn').addEventListener('click', () => {
            editingPostId = post.objectId; // Bmob ID
            titleInput.value = post.title;
            contentInput.value = post.content;
            blogFeed.classList.add('hidden');
            blogEditor.classList.remove('hidden');
        });

        document.getElementById('delete-post-btn').addEventListener('click', () => {
            if (confirm('确定删除?')) {
                const query = Bmob.Query('Posts');
                query.destroy(post.objectId).then(res => {
                    renderBlogList();
                }).catch(err => {
                    alert('删除失败: ' + err.message);
                });
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
                if (fileData.cloudId) {
                    const query = Bmob.Query('Books');
                    const bookObj = await query.get(fileData.cloudId);
                    bookObj.set('progress', readerContent.scrollTop);
                    bookObj.set('lastRead', Date.now());
                    await bookObj.save();
                } else {
                    // Try to find by fileName if cloudId missing (legacy compatibility)
                    const q = Bmob.Query('Books');
                    q.equalTo("fileName", "==", currentBookFileName);
                    q.find().then(res => {
                        if (res.length > 0) {
                            const obj = res[0];
                            obj.set('progress', readerContent.scrollTop);
                            obj.set('lastRead', Date.now());
                            obj.save();
                        }
                    });
                }

                // Always save locally too
                await ReaderDB.saveFile(fileData);

                // Visual feedback
                const originalText = saveProgressBtn.textContent;
                saveProgressBtn.textContent = "已保存(Cloud)!";
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
