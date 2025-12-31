/**
 * 🚗 Аналітична панель відстеження запчастин
 * Версія 3.3 - Виправлення відображення для мобільних
 */

class CarAnalyticsApp {
    constructor() {
        this.appData = null;
        this.cachedData = null;
        this.processedCars = null;
        this.filteredCars = null;
        
        this.state = {
            searchTerm: '',
            selectedCity: 'Всі міста',
            selectedCar: null,
            selectedStatus: 'all',
            selectedPartFilter: null,
            selectedHistoryPartFilter: null,
            historySearchTerm: '',
            currentView: 'list'
        };

        this.searchTimeout = null;
        this.historySearchTimeout = null;

        this.init();
    }

    async init() {
        console.log('🚀 Ініціалізація аналітичної панелі...');

        this.updateLoadingProgress(10);
        this.setupEventListeners();
        this.updateLoadingProgress(20);
        await this.loadData();
        this.updateLoadingProgress(100);

        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('main-interface').classList.remove('hidden');
            this.render();
        }, 500);

        this.startAutoRefresh();
    }

    // ВИПРАВЛЕНА функція для парсингу чисел
    parseNumber(value) {
        if (value === null || value === undefined || value === '') {
            return 0;
        }
        
        // Якщо вже число
        if (typeof value === 'number') {
            return isNaN(value) ? 0 : value;
        }
        
        // Конвертуємо в рядок і очищаємо
        const cleanStr = String(value)
            .trim()
            .replace(/\s+/g, '') // Видаляємо всі пробіли
            .replace(/,/g, '.'); // Замінюємо коми на крапки
        
        const parsed = parseFloat(cleanStr);
        return isNaN(parsed) ? 0 : parsed;
    }

    convertToThousands(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        return value;
    }

    formatNumber(number) {
        if (number === null || number === undefined || isNaN(number)) {
            return '-';
        }
        const roundedNumber = Math.round(number);
        return roundedNumber.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    formatMileage(mileage) {
        if (mileage === null || mileage === undefined || isNaN(mileage)) {
            return '- км';
        }
        const convertedMileage = this.convertToThousands(mileage);
        const formatted = this.formatNumber(convertedMileage);
        return `${formatted} км`;
    }

    getOriginalMileage(mileage) {
        if (mileage === null || mileage === undefined || isNaN(mileage)) {
            return 0;
        }
        return this.convertToThousands(mileage);
    }

    formatMileageDiff(mileageDiff) {
        if (mileageDiff === null || mileageDiff === undefined || isNaN(mileageDiff)) {
            return '- км';
        }
        const formatted = this.formatNumber(mileageDiff);
        return `${formatted} км`;
    }

    // ВИПРАВЛЕНА функція форматування ціни
    formatPrice(price) {
        if (price === null || price === undefined || isNaN(price) || price === 0) {
            return '';
        }
        
        // Округлюємо до 2 знаків після коми
        const rounded = Math.round(price * 100) / 100;
        
        // Форматуємо з пробілами для тисяч
        const parts = rounded.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        
        return parts.join('.');
    }

    setupEventListeners() {
        document.getElementById('refresh-data')?.addEventListener('click', () => {
            this.refreshData(true);
        });

        document.getElementById('clear-cache')?.addEventListener('click', () => {
            this.clearCache();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.state.selectedCar) {
                this.state.selectedCar = null;
                this.state.selectedHistoryPartFilter = null;
                this.state.historySearchTerm = '';
                this.render();
            }

            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.refreshData(true);
            }
        });
    }

    updateLoadingProgress(percent) {
        const bar = document.getElementById('loading-bar');
        if (bar) {
            bar.style.width = `${percent}%`;
        }
    }

    async loadData() {
        console.log('📥 Завантаження даних...');

        try {
            const cached = this.getCachedData();
            if (cached) {
                console.log('✅ Використано кешовані дані');
                this.appData = cached;
                this.updateCacheInfo();
                return;
            }

            await this.fetchDataFromSheets();

        } catch (error) {
            console.error('❌ Помилка завантаження даних:', error);
            this.showError(`Помилка завантаження: ${error.message}`);
        }
    }

    async fetchDataFromSheets() {
        const config = window.CONFIG;
        const { SPREADSHEET_ID, SHEETS, API_KEY } = config;

        console.log('📋 Завантаження даних з Google Sheets...');

        const [scheduleData, historyData] = await Promise.all([
            this.fetchSheetData(SPREADSHEET_ID, SHEETS.SCHEDULE, API_KEY),
            this.fetchSheetData(SPREADSHEET_ID, SHEETS.HISTORY, API_KEY)
        ]);

        console.log('✅ Дані отримано:', {
            scheduleRows: scheduleData?.length || 0,
            historyRows: historyData?.length || 0
        });

        this.processData(scheduleData, historyData);
        this.cacheData(this.appData);
        console.log('✅ Дані успішно оброблено');
        this.updateCacheInfo();
    }

    async fetchSheetData(spreadsheetId, sheetName, apiKey) {
        try {
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`;
            console.log(`📥 Запит до: ${sheetName}`);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data.values || [];
        } catch (error) {
            console.error(`❌ Помилка завантаження аркуша ${sheetName}:`, error);
            return [];
        }
    }

    processData(scheduleData, historyData) {
        console.log('🔧 Обробка даних...');

        if (!scheduleData || !historyData) {
            throw new Error('Немає даних для обробки');
        }

        const carsInfo = {};
        const carCities = {};

        for (let i = 1; i < scheduleData.length; i++) {
            const row = scheduleData[i];
            if (row.length < 5) continue;

            const license = String(row[CONSTANTS.SCHEDULE_COL_LICENSE] || '').trim();
            if (license) {
                const city = String(row[CONSTANTS.SCHEDULE_COL_CITY] || '').trim();
                carsInfo[license] = {
                    city: city,
                    license: license,
                    model: String(row[CONSTANTS.SCHEDULE_COL_MODEL] || '').trim(),
                    year: String(row[CONSTANTS.SCHEDULE_COL_YEAR] || '').trim()
                };
                carCities[license] = city;
            }
        }

        const allowedCars = Object.keys(carsInfo);
        const records = [];
        const currentMileages = {};
        const allowedCarsSet = new Set(allowedCars);

        for (let i = 1; i < historyData.length; i++) {
            const row = historyData[i];
            if (row.length < 8) continue;

            const car = String(row[CONSTANTS.COL_CAR] || '').trim();
            if (!car || !allowedCarsSet.has(car)) continue;

            const mileageStr = String(row[CONSTANTS.COL_MILEAGE] || '').trim();
            let mileage = 0;

            if (mileageStr) {
                const cleanStr = mileageStr.replace(/[\s,]/g, '');
                mileage = parseFloat(cleanStr);
                if (isNaN(mileage)) continue;
                mileage = this.convertToThousands(mileage);
            }

            if (mileage === 0) continue;

            let date = row[CONSTANTS.COL_DATE];
            if (date) {
                const dateObj = this.parseDate(date);
                if (dateObj) {
                    date = dateObj.toISOString().split('T')[0];
                } else {
                    date = String(date).trim();
                }
            }

            const city = carCities[car] || '';

            // ВИПРАВЛЕНО: використовуємо parseNumber для всіх числових значень
            const quantity = row.length > CONSTANTS.COL_QUANTITY ? this.parseNumber(row[CONSTANTS.COL_QUANTITY]) : 0;
            const price = row.length > CONSTANTS.COL_PRICE ? this.parseNumber(row[CONSTANTS.COL_PRICE]) : 0;
            const totalWithVAT = row.length > CONSTANTS.COL_TOTAL_WITH_VAT ? this.parseNumber(row[CONSTANTS.COL_TOTAL_WITH_VAT]) : 0;

            records.push({
                date: date || '',
                city: city,
                car: car,
                mileage: mileage,
                originalMileage: mileageStr,
                description: String(row[CONSTANTS.COL_DESCRIPTION] || ''),
                partCode: row.length > CONSTANTS.COL_PART_CODE ? String(row[CONSTANTS.COL_PART_CODE] || '').trim() : '',
                unit: row.length > CONSTANTS.COL_UNIT ? String(row[CONSTANTS.COL_UNIT] || '').trim() : '',
                quantity: quantity,
                price: price,
                totalWithVAT: totalWithVAT,
                status: row.length > CONSTANTS.COL_STATUS ? String(row[CONSTANTS.COL_STATUS] || '').trim() : ''
            });

            if (mileage > (currentMileages[car] || 0)) {
                currentMileages[car] = mileage;
            }
        }

        this.appData = {
            records: records,
            currentMileages: currentMileages,
            carsInfo: carsInfo,
            partKeywords: CONSTANTS.PARTS_CONFIG,
            partsOrder: CONSTANTS.PARTS_ORDER,
            currentDate: new Date().toISOString().split('T')[0],
            lastUpdated: new Date().toISOString(),
            _meta: {
                totalCars: allowedCars.length,
                totalRecords: records.length,
                processingTime: Date.now()
            }
        };

        document.getElementById('cars-count').textContent = allowedCars.length;
        
        this.processedCars = null;
        this.filteredCars = null;
    }

    parseDate(dateString) {
        if (!dateString) return null;

        const formats = [
            () => new Date(dateString),
            () => {
                const parts = dateString.split('.');
                if (parts.length === 3) {
                    return new Date(parts[2], parts[1] - 1, parts[0]);
                }
                return null;
            },
            () => {
                const parts = dateString.split('-');
                if (parts.length === 3) {
                    return new Date(parts[0], parts[1] - 1, parts[2]);
                }
                return null;
            }
        ];

        for (const format of formats) {
            try {
                const date = format();
                if (date && !isNaN(date.getTime())) {
                    return date;
                }
            } catch (e) {
                // Продовжуємо спроби
            }
        }

        return null;
    }

    getCachedData() {
        try {
            const cached = localStorage.getItem('carAnalyticsData');
            if (!cached) return null;

            const data = JSON.parse(cached);
            const cacheTime = new Date(data.lastUpdated).getTime();
            const currentTime = Date.now();
            const maxAge = 5 * 60 * 1000;

            if (currentTime - cacheTime > maxAge) {
                console.log(`⚠️ Кеш застарів (${Math.floor((currentTime - cacheTime) / 1000 / 60)} хв)`);
                return null;
            }

            return data;
        } catch (error) {
            console.warn('⚠️ Помилка читання кешу:', error);
            return null;
        }
    }

    cacheData(data) {
        try {
            const dataString = JSON.stringify(data);
            localStorage.setItem('carAnalyticsData', dataString);
            localStorage.setItem('carAnalyticsCacheTime', new Date().toISOString());
            console.log('💾 Дані збережено в кеш');
        } catch (error) {
            console.warn('⚠️ Помилка збереження кешу:', error);
        }
    }

    clearCache() {
        try {
            localStorage.removeItem('carAnalyticsData');
            localStorage.removeItem('carAnalyticsCacheTime');
            this.processedCars = null;
            this.filteredCars = null;
            console.log('🗑️ Кеш очищено');
            this.showNotification('Кеш успішно очищено', 'success');
            this.updateCacheInfo();
        } catch (error) {
            console.error('❌ Помилка очищення кешу:', error);
            this.showNotification('Помилка очищення кешу', 'error');
        }
    }

    updateCacheInfo() {
        try {
            const cacheTime = localStorage.getItem('carAnalyticsCacheTime');
            if (cacheTime) {
                const time = new Date(cacheTime);
                const now = new Date();
                const diffMinutes = Math.floor((now - time) / (1000 * 60));
                console.log(`⏰ Кеш оновлено ${diffMinutes} хвилин тому`);
            }
        } catch (error) {
            // Ігноруємо помилки
        }
    }

    render() {
        if (!this.appData) {
            this.showError('Дані не завантажено');
            return;
        }

        if (this.appData._meta.totalCars === 0) {
            this.renderNoData();
            return;
        }

        if (this.state.selectedCar) {
            this.renderCarDetail();
        } else {
            this.renderCarList();
        }
    }

    renderNoData() {
        const html = `
            <div class="min-h-screen flex flex-col items-center justify-center p-4">
                <div class="text-center max-w-md">
                    <div class="text-4xl mb-4">🚫</div>
                    <h1 class="text-2xl font-bold text-white mb-2">Немає даних</h1>
                    <p class="text-blue-200 text-sm mb-6">Не знайдено автомобілів для відображення</p>
                    <div class="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                        <div class="text-white text-sm mb-3">
                            Можливі причини:
                            <ul class="text-left mt-2 text-blue-200">
                                <li>• Аркуш "ГРАФІК ОБСЛУГОВУВАННЯ" порожній</li>
                                <li>• Неправильні назви аркушів</li>
                                <li>• Проблеми з API ключем</li>
                            </ul>
                        </div>
                        <button onclick="app.refreshData(true)"
                                class="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors w-full">
                            🔄 Спробувати знову
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('main-interface').innerHTML = html;
    }

    renderCarList() {
        if (!this.processedCars) {
            this.processedCars = this.processCarData();
        }
        
        const data = this.processedCars;
        const filteredData = this.filterCars(data);
        const cities = this.getCities(data);
        const stats = this.calculateStats(data);

        const html = this.generateCarListHTML(data, filteredData, cities, stats);
        document.getElementById('main-interface').innerHTML = html;
    }

    renderCarDetail() {
        if (!this.processedCars) {
            this.processedCars = this.processCarData();
        }
        
        const data = this.processedCars;
        const car = data.find(c => c.car === this.state.selectedCar);

        if (!car) {
            this.state.selectedCar = null;
            this.render();
            return;
        }

        const html = this.generateCarDetailHTML(car);
        document.getElementById('main-interface').innerHTML = html;
    }

    processCarData() {
        if (!this.appData) return [];

        const { records, carsInfo, currentMileages, partKeywords, partsOrder, currentDate } = this.appData;
        const cars = {};

        for (const license in carsInfo) {
            const carInfo = carsInfo[license];
            cars[license] = {
                city: carInfo.city,
                car: license,
                license: license,
                model: carInfo.model,
                year: carInfo.year,
                currentMileage: currentMileages[license] || 0,
                parts: {},
                history: []
            };

            for (const partName of partsOrder) {
                cars[license].parts[partName] = null;
            }
        }

        for (const record of records) {
            const car = cars[record.car];
            if (!car) continue;

            car.history.push(record);

            const descLower = record.description.toLowerCase();
            for (const partName in partKeywords) {
                const keywords = partKeywords[partName];
                let matched = false;
                
                for (const keyword of keywords) {
                    if (descLower.includes(keyword.toLowerCase())) {
                        matched = true;
                        break;
                    }
                }
                
                if (matched) {
                    const existingPart = car.parts[partName];
                    if (!existingPart || record.mileage > existingPart.mileage) {
                        const mileageDiff = car.currentMileage - record.mileage;
                        const daysDiff = Math.floor((new Date(currentDate) - new Date(record.date)) / (1000 * 60 * 60 * 24));
                        const carYear = parseInt(car.year) || 0;
                        const carModel = car.model || '';

                        const years = Math.floor(daysDiff / 365);
                        const months = Math.floor((daysDiff % 365) / 30);
                        let timeDiff = '';

                        if (years > 0) timeDiff += years + 'р ';
                        if (months > 0) timeDiff += months + 'міс';
                        if (!timeDiff) timeDiff = daysDiff + 'дн';

                        car.parts[partName] = {
                            date: record.date,
                            mileage: record.mileage,
                            currentMileage: car.currentMileage,
                            mileageDiff: mileageDiff,
                            timeDiff: timeDiff,
                            daysDiff: daysDiff,
                            status: this.getPartStatus(partName, mileageDiff, daysDiff, carYear, carModel)
                        };
                    }
                }
            }
        }

        const sortedCars = Object.values(cars);
        sortedCars.sort((a, b) => {
            const cityCompare = (a.city || '').localeCompare(b.city || '', 'uk');
            return cityCompare !== 0 ? cityCompare : (a.license || '').localeCompare(b.license || '', 'uk');
        });

        for (const car of sortedCars) {
            car.history.sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        return sortedCars;
    }

    filterCars(cars) {
        const { searchTerm, selectedCity, selectedStatus, selectedPartFilter } = this.state;
        const term = searchTerm.toLowerCase();
        const isAllCities = selectedCity === 'Всі міста';

        return cars.filter(car => {
            if (term && !(
                (car.car && car.car.toLowerCase().includes(term)) ||
                (car.city && car.city.toLowerCase().includes(term)) ||
                (car.model && car.model.toLowerCase().includes(term)) ||
                (car.license && car.license.toLowerCase().includes(term))
            )) return false;

            if (!isAllCities && car.city !== selectedCity) return false;

            if (selectedStatus !== 'all') {
                let hasStatus = false;
                for (const partName in car.parts) {
                    const part = car.parts[partName];
                    if (part && part.status === selectedStatus) {
                        hasStatus = true;
                        break;
                    }
                }
                if (!hasStatus) return false;
            }

            if (selectedPartFilter) {
                const part = car.parts[selectedPartFilter.partName];
                if (selectedPartFilter.status === 'all') {
                    if (!part) return false;
                } else if (!part || part.status !== selectedPartFilter.status) {
                    return false;
                }
            }

            return true;
        });
    }

    getCities(cars) {
        const cities = new Set();
        for (const car of cars) {
            if (car.city) cities.add(car.city);
        }
        // Сортуємо міста і додаємо "Всі міста" на початку
        const sortedCities = Array.from(cities).sort((a, b) => a.localeCompare(b, 'uk'));
        return ['Всі міста', ...sortedCities];
    }

    calculateStats(cars) {
        let totalCars = 0;
        let carsWithGood = 0;
        let carsWithWarning = 0;
        let carsWithCritical = 0;

        for (const car of cars) {
            totalCars++;
            let hasGood = false, hasWarning = false, hasCritical = false;

            for (const partName in car.parts) {
                const part = car.parts[partName];
                if (part) {
                    if (part.status === 'good') hasGood = true;
                    if (part.status === 'warning') hasWarning = true;
                    if (part.status === 'critical') hasCritical = true;
                }
            }

            if (hasGood) carsWithGood++;
            if (hasWarning) carsWithWarning++;
            if (hasCritical) carsWithCritical++;
        }

        return { totalCars, carsWithGood, carsWithWarning, carsWithCritical };
    }

    generateCarListHTML(allCars, filteredCars, cities, stats) {
        const importantParts = CONSTANTS.PARTS_ORDER.slice(0, 7);

        return `
            <div class="min-h-screen">
                <div class="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-b-xl shadow-xl p-4 mb-6">
                    <div class="w-full px-2 sm:px-4">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h1 class="text-2xl sm:text-3xl font-bold text-white mb-1">🚗 Список автомобілів</h1>
                                <p class="text-blue-100 text-sm">Натисніть на рядок для перегляду деталей</p>
                            </div>
                            <div class="text-right">
                                <div class="text-blue-100 text-xs">Дата оновлення</div>
                                <div class="text-white text-lg font-bold">${this.appData.currentDate}</div>
                                <div class="text-blue-200 text-xs">${allCars.length} авто • ${this.appData._meta.totalRecords} записів</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="w-full px-2 sm:px-4">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        ${this.generateStatsCards(stats)}
                    </div>

                    <div class="bg-white rounded-xl shadow-lg p-4 mb-4">
                        ${this.generateFiltersHTML(cities)}
                    </div>

                    <div class="bg-white rounded-xl shadow-xl overflow-hidden w-full">
                        ${this.generateCarsTable(filteredCars, importantParts)}
                    </div>

                    <div class="mt-4 bg-white rounded-xl shadow-lg p-4">
                        <h3 class="font-bold text-gray-800 mb-2 text-sm">📊 Легенда</h3>
                        <div class="flex flex-wrap gap-4 text-xs">
                            <div class="flex items-center gap-2"><div class="w-4 h-4 bg-green-500 rounded-full"></div><span>Норма</span></div>
                            <div class="flex items-center gap-2"><div class="w-4 h-4 bg-orange-500 rounded-full"></div><span>Увага</span></div>
                            <div class="flex items-center gap-2"><div class="w-4 h-4 bg-red-500 rounded-full"></div><span>Критично</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    generateStatsCards(stats) {
        const { totalCars, carsWithGood, carsWithWarning, carsWithCritical } = stats;
        const { selectedStatus } = this.state;

        const cards = [
            { count: totalCars, label: 'Всього авто', status: 'all', color: 'from-blue-500 to-blue-600', icon: '🚗' },
            { count: carsWithGood, label: 'У нормі', status: 'good', color: 'from-green-500 to-green-600', icon: '✅' },
            { count: carsWithWarning, label: 'Увага', status: 'warning', color: 'from-orange-500 to-orange-600', icon: '⚠️' },
            { count: carsWithCritical, label: 'Критично', status: 'critical', color: 'from-red-500 to-red-600', icon: '⛔' }
        ];

        return cards.map(card => `
            <div class="bg-gradient-to-br ${card.color} rounded-lg shadow-lg p-4 text-white cursor-pointer hover:shadow-xl transition-all ${selectedStatus === card.status ? 'ring-2 ring-blue-300' : ''}"
                 onclick="app.setState({ selectedStatus: '${card.status}' }); app.render();">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-2xl sm:text-3xl font-bold mb-1">${card.count}</div>
                        <div class="text-white/90 text-sm font-medium">${card.label}</div>
                    </div>
                    <div class="text-2xl">${card.icon}</div>
                </div>
                ${selectedStatus === card.status ? '<div class="text-xs text-white/70 mt-2">● Активний</div>' : ''}
            </div>
        `).join('');
    }

    generateFiltersHTML(cities) {
        const { selectedPartFilter, searchTerm, selectedCity } = this.state;

        return `
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2"><span>🔍</span> Фільтри</h3>
                ${selectedPartFilter ? `
                    <button onclick="app.clearPartFilter();"
                            class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-colors">
                        ✕ Скинути фільтр
                    </button>
                ` : ''}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Пошук авто</label>
                    <input
                        type="text"
                        value="${searchTerm}"
                        oninput="app.debouncedSearch(this.value)"
                        placeholder="Номер, модель, місто..."
                        class="w-full px-3 py-2 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mobile-dark-text"
                        id="mainSearchInput"
                    >
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Місто</label>
                    <select onchange="app.setState({ selectedCity: this.value }); app.render();"
                            class="w-full px-3 py-2 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mobile-dark-text">
                        ${cities.map(city => `
                            <option value="${city}" ${city === selectedCity ? 'selected' : ''} class="text-gray-800">${city}</option>
                        `).join('')}
                    </select>
                </div>
            </div>
            ${selectedPartFilter ? `
                <div class="mt-3 p-3 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <div class="text-sm font-semibold text-blue-800 flex items-center gap-2">
                        <span>📌</span>
                        <span>Активний фільтр: ${selectedPartFilter.partName} -
                        ${selectedPartFilter.status === 'all' ? 'Всі записи' :
                          selectedPartFilter.status === 'good' ? '✅ У нормі' :
                          selectedPartFilter.status === 'warning' ? '⚠️ Увага' : '⛔ Критично'}</span>
                    </div>
                </div>
            ` : ''}
        `;
    }

    generateCarsTable(cars, importantParts) {
        if (cars.length === 0) {
            return `
                <div class="px-4 py-12 text-center">
                    <div class="text-gray-400 text-lg mb-2">🚫</div>
                    <div class="text-gray-600 font-medium">Автомобілів не знайдено</div>
                    <div class="text-gray-400 text-sm mt-1">Спробуйте змінити параметри пошуку</div>
                </div>
            `;
        }

        const tableHeaders = this.generateTableHeaders(importantParts);
        const tableRows = cars.map((car, idx) => this.generateCarRow(car, idx, importantParts)).join('');

        return `
            <div class="overflow-x-auto w-full">
                <table class="w-full min-w-[1000px]">
                    <thead class="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                        <tr>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase">Статус</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase">Номер</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase mobile-hidden">Модель</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase mobile-hidden">Рік</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase">Місто</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase">Пробіг</th>
                            ${tableHeaders}
                            <th class="px-3 py-3 text-center text-xs font-bold uppercase mobile-hidden">✅</th>
                            <th class="px-3 py-3 text-center text-xs font-bold uppercase mobile-hidden">⚠️</th>
                            <th class="px-3 py-3 text-center text-xs font-bold uppercase mobile-hidden">⛔</th>
                            <th class="px-3 py-3 text-center text-xs font-bold uppercase">📋</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
    }

    generateTableHeaders(importantParts) {
        return importantParts.map(partName => {
            let shortName, emoji;

            if (partName.includes('ТО')) {
                shortName = 'ТО';
                emoji = '🛢️';
            } else if (partName.includes('ГРМ')) {
                shortName = 'ГРМ';
                emoji = '⚙️';
            } else if (partName.includes('Помпа')) {
                shortName = 'Помпа';
                emoji = '💧';
            } else if (partName.includes('Обвід')) {
                shortName = 'Обвід';
                emoji = '🔧';
            } else if (partName.includes('Діагн')) {
                shortName = 'Діаг';
                emoji = '🔍';
            } else if (partName.includes('Розвал')) {
                shortName = 'Розв';
                emoji = '📐';
            } else if (partName.includes('Профілактика') || partName.includes('Супорт')) {
                shortName = 'Супорт';
                emoji = '🛠️';
            } else {
                shortName = partName.split(' ')[0];
                emoji = '🔧';
            }

            return `
                <th class="px-2 py-2 text-center text-xs font-bold uppercase">
                    <div class="cursor-pointer hover:bg-white/10 p-1 rounded"
                         onclick="event.stopPropagation(); app.showPartFilterMenu(event, '${partName}')">
                        <div class="font-bold">${shortName}</div>
                        <div class="text-xs opacity-70">${emoji}</div>
                    </div>
                </th>
            `;
        }).join('');
    }

    generateCarRow(car, idx, importantParts) {
        const parts = Object.values(car.parts).filter(p => p !== null);
        const criticalCount = parts.filter(p => p.status === 'critical').length;
        const warningCount = parts.filter(p => p.status === 'warning').length;
        const goodCount = parts.filter(p => p.status === 'good').length;

        const statusColor = criticalCount > 0 ? 'bg-red-500' : warningCount > 0 ? 'bg-orange-500' : 'bg-green-500';
        
        // Виправлення: Використовуємо стандартні класи для правильного кольору фону
        const rowBg = idx % 2 === 0 ? 'bg-gray-50' : 'bg-white';

        const partCells = importantParts.map(partName => {
            const part = car.parts[partName];
            const isMonths = partName.includes('Діагностика') || partName.includes('Розвал') || partName.includes('Профілактика');
            const display = this.getPartDisplay(part, isMonths);
            return `<td class="px-2 py-3 text-center"><div class="${display.bg} ${display.color} font-semibold text-xs py-1 px-2 rounded whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]">${display.text}</div></td>`;
        }).join('');

        return `
            <tr class="${rowBg} hover:bg-blue-50 cursor-pointer transition-colors mobile-dark-row"
                onclick="app.setState({ selectedCar: '${car.car}' }); app.render();">
                <td class="px-3 py-3"><div class="${statusColor} w-3 h-3 rounded-full"></div></td>
                <td class="px-3 py-3">
                    <div class="font-bold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]"
                         title="${car.license}">${car.license}</div>
                </td>
                <td class="px-3 py-3 mobile-hidden">
                    <div class="text-gray-700 text-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]"
                         title="${car.model}">${car.model}</div>
                </td>
                <td class="px-3 py-3 mobile-hidden">
                    <div class="text-gray-600 text-sm whitespace-nowrap">${car.year || '-'}</div>
                </td>
                <td class="px-3 py-3">
                    <div class="text-gray-700 text-sm whitespace-nowrap flex items-center gap-1">
                        <span>📍</span>
                        <span class="font-medium">${car.city || '-'}</span>
                    </div>
                </td>
                <td class="px-3 py-3">
                    <div class="font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
                        ${this.formatMileage(car.currentMileage)}
                    </div>
                </td>
                ${partCells}
                <td class="px-3 py-3 text-center mobile-hidden">
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold text-sm">
                        ${goodCount}
                    </span>
                </td>
                <td class="px-3 py-3 text-center mobile-hidden">
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold text-sm">
                        ${warningCount}
                    </span>
                </td>
                <td class="px-3 py-3 text-center mobile-hidden">
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold text-sm">
                        ${criticalCount}
                    </span>
                </td>
                <td class="px-3 py-3 text-center">
                    <div class="text-blue-600 font-semibold text-sm whitespace-nowrap">
                        ${car.history.length}
                    </div>
                </td>
            </tr>
        `;
    }

    getPartDisplay(part, isMonths = false) {
        if (!part) return { color: 'text-gray-400', text: '-', bg: 'bg-gray-100' };

        let color = 'text-green-600', bg = 'bg-green-100';
        if (part.status === 'warning') { color = 'text-orange-600'; bg = 'bg-orange-100'; }
        else if (part.status === 'critical') { color = 'text-red-600'; bg = 'bg-red-100'; }

        const text = isMonths ?
            Math.floor(part.daysDiff / 30) + 'міс' :
            this.formatMileageDiff(part.mileageDiff);

        return { color, text, bg };
    }

    generateCarDetailHTML(car) {
    const { selectedHistoryPartFilter, historySearchTerm } = this.state;
    const displayHistory = this.filterCarHistory(car.history, selectedHistoryPartFilter, historySearchTerm);
    const partNames = CONSTANTS.PARTS_ORDER;

    return `
        <div class="min-h-screen">
            <!-- Фіксована верхня панель -->
            <div class="sticky top-0 z-40 bg-gradient-to-b from-slate-900 via-blue-900/90 to-slate-900/90 backdrop-blur-sm border-b border-blue-700/30">
                <div class="px-2 sm:px-4 py-3">
                    <button onclick="app.setState({ selectedCar: null, selectedHistoryPartFilter: null, historySearchTerm: '' });"
                            class="bg-white hover:bg-gray-100 text-blue-600 font-semibold px-4 py-2 rounded-lg shadow-lg transition-all flex items-center gap-2 mb-3">
                        ← Назад до списку
                    </button>
                    <div class="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-2xl p-4">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div class="flex items-center gap-3">
                                <div class="bg-white/20 p-3 rounded-xl text-3xl">🚗</div>
                                <div>
                                    <div class="text-white text-xl font-bold">${car.license}</div>
                                    <div class="text-blue-100 text-base">${car.model || 'Немає моделі'}</div>
                                    <div class="text-blue-200 text-xs mt-1">
                                        ${car.year ? car.year + ' рік' : ''}
                                        ${car.year && car.city ? ' • ' : ''}
                                        ${car.city || ''}
                                    </div>
                                </div>
                            </div>
                            <div class="text-left sm:text-right">
                                <div class="text-blue-100 text-xs">Поточний пробіг</div>
                                <div class="text-white text-xl font-bold">${this.formatMileage(car.currentMileage)}</div>
                                <div class="text-blue-200 text-xs mt-1">📋 ${car.history.length} записів в історії</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Основний вміст з прокруткою -->
            <div class="w-full px-2 sm:px-4 pt-4">
                <div class="bg-white rounded-xl shadow-xl p-3 mb-4 mobile-dark-text">
                    ${this.generateCarPartsHTML(car, partNames)}
                </div>

                <div class="bg-white rounded-xl shadow-xl p-3 mobile-dark-text">
                    ${this.generateCarHistoryHTML(car, displayHistory)}
                </div>
            </div>
        </div>
    `;
}

    generateCarPartsHTML(car, partNames) {
        const importantParts = partNames.slice(0, 8);
        const otherParts = partNames.slice(8);

        return `
            <h3 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span>🔧</span> Стан запчастин
                ${this.state.selectedHistoryPartFilter || this.state.historySearchTerm ? `
                    <button onclick="app.setState({ selectedHistoryPartFilter: null, historySearchTerm: '' });"
                            class="ml-auto bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-semibold transition-colors">
                        ✕ Скинути всі фільтри
                    </button>
                ` : ''}
            </h3>

            <div class="mb-4">
                <h4 class="text-base font-semibold text-blue-600 mb-2">⚡ Важливі категорії</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    ${importantParts.map(partName => this.generatePartCard(car, partName)).join('')}
                </div>
            </div>

            <div>
                <h4 class="text-base font-semibold text-gray-600 mb-2">🔩 Інші запчастини</h4>
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    ${otherParts.map(partName => this.generatePartCard(car, partName, true)).join('')}
                </div>
            </div>
        `;
    }

    generatePartCard(car, partName, small = false) {
        const part = car.parts[partName];
        const isActive = this.state.selectedHistoryPartFilter === partName;

        let borderClass = !part ? 'border-gray-200' :
                         part.status === 'critical' ? 'border-red-300' :
                         part.status === 'warning' ? 'border-orange-300' : 'border-green-300';

        let bgClass = !part ? 'bg-gray-50' :
                     part.status === 'critical' ? 'bg-red-50' :
                     part.status === 'warning' ? 'bg-orange-50' : 'bg-green-50';

        let textClass = !part ? 'text-gray-400' :
                       part.status === 'critical' ? 'text-red-600' :
                       part.status === 'warning' ? 'text-orange-600' : 'text-green-600';

        const activeClass = isActive ? 'border-2 border-blue-500 ring-2 ring-blue-200' : '';
        const formattedDate = part ? this.formatDate(part.date) : '';

        const cardClass = small ? 'p-2 rounded border' : 'p-3 rounded-lg border';
        const textSize = small ? 'text-xs' : 'text-sm';

        return `
            <div class="${cardClass} ${borderClass} ${bgClass} cursor-pointer hover:shadow transition-all ${activeClass}"
                 onclick="app.setState({ selectedHistoryPartFilter: app.state.selectedHistoryPartFilter === '${partName}' ? null : '${partName}' });">
                <div class="font-bold text-gray-800 ${textSize} mb-1 flex items-center justify-between">
                    <span class="truncate" title="${partName}">${partName}</span>
                    ${isActive ? '<span class="text-blue-500 text-xs flex-shrink-0 ml-1">📌</span>' : ''}
                </div>
                ${part ? `
                    <div class="${small ? 'space-y-0.5' : 'space-y-1'}">
                        <div class="flex justify-between items-center">
                            <div class="text-xs text-gray-700 font-bold">📅 Дата:</div>
                            <div class="font-extrabold text-gray-900 text-sm">${formattedDate}</div>
                        </div>
                        <div class="text-center my-1">
                            <div class="${small ? 'text-base' : 'text-xl'} font-extrabold ${textClass}">
                                ${this.formatMileageDiff(part.mileageDiff)}
                            </div>
                        </div>
                        <div class="flex justify-between items-center">
                            <div class="text-xs text-gray-700 font-bold">⏰ Час:</div>
                            <div class="text-sm font-extrabold text-gray-900">${part.timeDiff}</div>
                        </div>
                    </div>
                ` : '<div class="text-gray-300 text-xs text-center py-2">Немає даних</div>'}
            </div>
        `;
    }

    generateCarHistoryHTML(car, displayHistory) {
        return `
            <h3 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span>📜</span> Історія обслуговування
                ${this.state.selectedHistoryPartFilter || this.state.historySearchTerm ? `
                    <div class="flex flex-wrap items-center gap-1">
                        ${this.state.selectedHistoryPartFilter ? `
                            <span class="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                📌 ${this.state.selectedHistoryPartFilter}
                            </span>
                        ` : ''}
                        ${this.state.historySearchTerm ? `
                            <span class="text-xs font-normal text-green-600 bg-green-50 px-2 py-1 rounded">
                                🔎 "${this.state.historySearchTerm}"
                            </span>
                        ` : ''}
                        <button onclick="app.setState({ selectedHistoryPartFilter: null, historySearchTerm: '' });"
                                class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1">
                            ✕ Скинути всі фільтри
                        </button>
                    </div>
                ` : ''}
                <span class="ml-auto text-xs font-normal text-gray-600">
                    ${displayHistory.length} з ${car.history.length} записів
                </span>
            </h3>

            <div class="mb-3">
                <label class="block text-xs font-medium text-gray-700 mb-1">🔍 Пошук в історії</label>
                <div class="flex gap-1">
                    <input
                        type="text"
                        value="${this.state.historySearchTerm}"
                        oninput="app.debouncedHistorySearch(this.value)"
                        placeholder="Пошук за текстом, датою або пробігом..."
                        class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 mobile-dark-text"
                        id="historySearchInput"
                    >
                    ${this.state.historySearchTerm ? `
                        <button onclick="app.setState({ historySearchTerm: '' });"
                                class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs font-semibold transition-colors">
                            ✕
                        </button>
                    ` : ''}
                </div>
                <div class="text-xs text-gray-400 mt-1">Пошук працює по опису, даті, пробігу, коду запчастини та статусу</div>
            </div>

            ${displayHistory.length === 0 ? this.generateNoHistoryHTML() : this.generateHistoryListHTML(displayHistory)}
        `;
    }

    generateNoHistoryHTML() {
        const hasFilters = this.state.selectedHistoryPartFilter || this.state.historySearchTerm;

        return `
            <div class="text-center py-8 text-gray-500">
                <div class="text-3xl mb-2">🔍</div>
                <div class="text-base font-semibold">Записів не знайдено</div>
                <div class="text-xs text-gray-400 mt-1">
                    ${hasFilters ? 'Спробуйте змінити параметри пошуку або очистити фільтри' : 'Цей автомобіль ще не має записів в історії'}
                </div>
                ${hasFilters ? `
                    <button onclick="app.setState({ selectedHistoryPartFilter: null, historySearchTerm: '' });"
                            class="mt-3 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition-colors text-xs">
                        Очистити всі фільтри
                    </button>
                ` : ''}
            </div>
        `;
    }

    generateHistoryListHTML(history) {
        return `
            <div class="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                ${history.map(record => this.generateHistoryRecordHTML(record)).join('')}
            </div>
        `;
    }

    generateHistoryRecordHTML(record) {
        const formattedDate = this.formatDate(record.date);
        const formattedMileage = this.formatMileage(record.mileage);
        const formattedQuantity = record.quantity && record.quantity > 0 ? this.formatNumber(record.quantity) : '';
        const formattedPrice = record.price && record.price > 0 ? this.formatPrice(record.price) + ' ₴' : '';
        const formattedTotal = record.totalWithVAT && record.totalWithVAT > 0 ? this.formatPrice(record.totalWithVAT) + ' ₴' : '';

        // Повертаємо звичайний текст без жирного виділення
        let description = record.description;

        let statusClass = 'bg-gray-100 text-gray-600';
        let statusIcon = '🔄';
        if (record.status) {
            const statusLower = record.status.toLowerCase();
            if (statusLower.includes('виконано') || statusLower.includes('готово') || statusLower.includes('підтверджено')) {
                statusClass = 'bg-green-100 text-green-700';
                statusIcon = '✅';
            } else if (statusLower.includes('очікує') || statusLower.includes('в обробці') || statusLower.includes('замовлено')) {
                statusClass = 'bg-blue-100 text-blue-700';
                statusIcon = '⏳';
            } else if (statusLower.includes('відмов') || statusLower.includes('скасовано') || statusLower.includes('недоступно')) {
                statusClass = 'bg-red-100 text-red-700';
                statusIcon = '❌';
            }
        }

        const unitDisplay = record.unit ? record.unit : (record.quantity > 0 ? 'шт.' : '');

        return `
            <div class="bg-gray-50 hover:bg-gray-100 rounded-lg p-4 border border-gray-200 transition-all hover:shadow-sm">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-base">📅</span>
                        <span class="font-bold text-gray-800 text-sm">${formattedDate}</span>
                    </div>
                    <div class="flex items-center gap-2 bg-orange-50 px-3 py-1 rounded-full">
                        <span class="text-sm">🛣️</span>
                        <span class="font-bold text-orange-700 text-sm">${formattedMileage}</span>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div class="text-gray-700 text-sm flex-1">
                        ${description}
                        ${record.partCode || record.unit || record.quantity > 0 || record.price > 0 || record.totalWithVAT > 0 ? `
                            <div class="mt-2 flex flex-wrap gap-2 items-center">
                                ${record.partCode ? `
                                    <span class="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                                        <span>🔩</span>
                                        <span class="font-medium">Код: ${record.partCode}</span>
                                    </span>
                                ` : ''}
                                ${unitDisplay ? `
                                    <span class="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                                        <span>📦</span>
                                        <span>Од.: ${unitDisplay}</span>
                                    </span>
                                ` : ''}
                                ${formattedQuantity ? `
                                    <span class="inline-flex items-center gap-1 bg-blue-50 px-2 py-1 rounded text-xs">
                                        <span>🔢</span>
                                        <span>Кільк.: ${formattedQuantity}</span>
                                    </span>
                                ` : ''}
                                ${formattedPrice ? `
                                    <span class="inline-flex items-center gap-1 bg-blue-100 px-2 py-1 rounded text-xs">
                                        <span>💰</span>
                                        <span class="font-semibold">Ціна: ${formattedPrice}</span>
                                    </span>
                                ` : ''}
                                ${formattedTotal ? `
                                    <span class="inline-flex items-center gap-1 bg-green-100 px-2 py-1 rounded text-xs">
                                        <span>💵</span>
                                        <span class="font-bold">Сума: ${formattedTotal}</span>
                                    </span>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>

                    ${record.status ? `
                        <div class="${statusClass} px-3 py-1 rounded text-xs font-medium whitespace-nowrap mt-2 sm:mt-0 self-start">
                            ${statusIcon} ${record.status}
                        </div>
                ` : ''}
                </div>
            </div>
        `;
    }

    formatDate(dateString) {
        if (!dateString) return '';

        if (dateString.includes('.')) return dateString;

        if (dateString.includes('-')) {
            const parts = dateString.split('-');
            if (parts.length === 3) {
                const [year, month, day] = parts;
                return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
            }
        }

        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        }

        return dateString;
    }

    filterCarHistory(history, partFilter, searchTerm) {
        let filtered = [...history];

        if (partFilter) {
            const keywords = CONSTANTS.PARTS_CONFIG[partFilter];
            if (keywords) {
                const keywordsLower = keywords.map(k => k.toLowerCase());
                filtered = filtered.filter(record => {
                    const descLower = record.description.toLowerCase();
                    for (const keyword of keywordsLower) {
                        if (descLower.includes(keyword)) return true;
                    }
                    return false;
                });
            }
        }

        if (searchTerm && searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(record =>
                record.description.toLowerCase().includes(term) ||
                (record.date && record.date.toLowerCase().includes(term)) ||
                record.mileage.toString().includes(term) ||
                (record.partCode && record.partCode.toLowerCase().includes(term)) ||
                (record.unit && record.unit.toLowerCase().includes(term)) ||
                (record.status && record.status.toLowerCase().includes(term))
            );
        }

        return filtered;
    }

    matchesKeywords(description, keywords) {
        const lowerDesc = description.toLowerCase();
        for (const keyword of keywords) {
            if (lowerDesc.includes(keyword.toLowerCase())) return true;
        }
        return false;
    }

    getPartStatus(partName, mileageDiff, daysDiff, carYear, carModel) {
        const monthsDiff = daysDiff / 30;
        const isMercedesSprinter = carModel && carModel.toLowerCase().includes('mercedes') && carModel.toLowerCase().includes('sprinter');

        if (isMercedesSprinter) {
            if (partName === 'ГРМ (ролики+ремінь) ⚙️') {
                return 'good';
            }
            if (partName === 'Помпа 💧') {
                if (mileageDiff >= 120000) return 'warning';
                return 'good';
            }
        }

        switch(partName) {
            case 'ТО (масло+фільтри) 🛢️':
                if (carYear && carYear >= 2010) {
                    if (mileageDiff >= 15500) return 'critical';
                    if (mileageDiff >= 14000) return 'warning';
                    return 'good';
                } else {
                    if (mileageDiff >= 10500) return 'critical';
                    if (mileageDiff >= 9000) return 'warning';
                    return 'good';
                }
            case 'ГРМ (ролики+ремінь) ⚙️': case 'Обвідний ремінь+ролики 🔧':
                if (mileageDiff >= 60500) return 'critical';
                if (mileageDiff >= 58000) return 'warning';
                return 'good';
            case 'Помпа 💧': case 'Зчеплення ⚙️': case 'Стартер 🔋': case 'Генератор ⚡':
                if (mileageDiff >= 120000) return 'critical';
                if (mileageDiff >= 80000) return 'warning';
                return 'good';
            case 'Діагностика ходової 🔍':
                if (monthsDiff > 3) return 'critical';
                if (monthsDiff >= 2) return 'warning';
                return 'good';
            case 'Розвал-сходження 📐': case 'Профілактика супортів 🛠️': case "Комп'ютерна діагностика 💻": case 'Прожиг сажового 🔥':
                if (monthsDiff > 4) return 'critical';
                if (monthsDiff >= 2) return 'warning';
                return 'good';
            case 'Гальмівні колодки 🛑':
                if (mileageDiff > 80000) return 'critical';
                if (mileageDiff >= 60000) return 'warning';
                return 'good';
            case 'Гальмівні диски 💿': case 'Амортизатори 🔧':
                if (mileageDiff > 100000) return 'critical';
                if (mileageDiff >= 70000) return 'warning';
                return 'good';
            case 'Опора амортизаторів 🛠️': case 'Шарова опора ⚪': case 'Рульова тяга 🔗': case 'Рульовий накінечник 🔩':
                if (mileageDiff > 60000) return 'critical';
                if (mileageDiff >= 50000) return 'warning';
                return 'good';
            case 'Акумулятор 🔋':
                const yearsDiff = daysDiff / 365;
                if (yearsDiff > 4) return 'critical';
                if (yearsDiff >= 3) return 'warning';
                return 'good';
            default:
                if (mileageDiff > 50000) return 'critical';
                if (mileageDiff > 30000) return 'warning';
                return 'good';
        }
    }

    setState(newState) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        const needsReprocess = 
            oldState.selectedCar !== this.state.selectedCar;
        
        const needsRefilter = 
            oldState.searchTerm !== this.state.searchTerm ||
            oldState.selectedCity !== this.state.selectedCity ||
            oldState.selectedStatus !== this.state.selectedStatus ||
            JSON.stringify(oldState.selectedPartFilter) !== JSON.stringify(this.state.selectedPartFilter);
        
        if (needsRefilter) {
            this.filteredCars = null;
        }
        
        this.render();
    }

    debouncedSearch(term) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.setState({ searchTerm: term });
        }, 300);
    }

    debouncedHistorySearch(term) {
        clearTimeout(this.historySearchTimeout);
        this.historySearchTimeout = setTimeout(() => {
            this.setState({ historySearchTerm: term });
        }, 300);
    }

    clearPartFilter() {
        this.setState({ selectedPartFilter: null });
    }

    showPartFilterMenu(event, partName) {
        event.stopPropagation();

        const existingMenu = document.getElementById('partFilterMenu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'partFilterMenu';
        menu.className = 'fixed bg-white shadow-2xl rounded-lg border border-blue-400 p-3 z-50 min-w-[180px]';
        
        // Виправлення позиціонування
        const rect = event.target.getBoundingClientRect();
        menu.style.top = (rect.bottom + 5) + 'px';
        menu.style.left = (rect.left) + 'px';
        menu.style.position = 'fixed';

        menu.innerHTML = `
            <div class="text-sm font-bold text-gray-800 mb-2 pb-2 border-b">Фільтр: ${partName.split(' ')[0]}</div>
            <div class="space-y-1">
                <div class="px-3 py-2 hover:bg-blue-50 rounded cursor-pointer transition-colors text-sm flex items-center gap-2"
                     onclick="app.setState({ selectedPartFilter: { partName: '${partName}', status: 'all' } }); app.render(); setTimeout(() => { document.getElementById('partFilterMenu')?.remove(); }, 100);">
                    📋 <span>Всі записи</span>
                </div>
                <div class="px-3 py-2 hover:bg-green-50 rounded cursor-pointer transition-colors text-sm flex items-center gap-2"
                     onclick="app.setState({ selectedPartFilter: { partName: '${partName}', status: 'good' } }); app.render(); setTimeout(() => { document.getElementById('partFilterMenu')?.remove(); }, 100);">
                    ✅ <span>У нормі</span>
                </div>
                <div class="px-3 py-2 hover:bg-orange-50 rounded cursor-pointer transition-colors text-sm flex items-center gap-2"
                     onclick="app.setState({ selectedPartFilter: { partName: '${partName}', status: 'warning' } }); app.render(); setTimeout(() => { document.getElementById('partFilterMenu')?.remove(); }, 100);">
                    ⚠️ <span>Увага</span>
                </div>
                <div class="px-3 py-2 hover:bg-red-50 rounded cursor-pointer transition-colors text-sm flex items-center gap-2"
                     onclick="app.setState({ selectedPartFilter: { partName: '${partName}', status: 'critical' } }); app.render(); setTimeout(() => { document.getElementById('partFilterMenu')?.remove(); }, 100);">
                    ⛔ <span>Критично</span>
                </div>
            </div>
        `;

        document.body.appendChild(menu);

        setTimeout(() => {
            const closeMenu = (e) => {
                if (menu && !menu.contains(e.target) && e.target !== event.target) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    async refreshData(force = false) {
        console.log('🔄 Оновлення даних...');

        this.showNotification('Оновлення даних...', 'info');

        try {
            if (force) {
                localStorage.removeItem('carAnalyticsData');
                this.processedCars = null;
                this.filteredCars = null;
            }

            await this.fetchDataFromSheets();
            this.render();

            this.showNotification('Дані успішно оновлено', 'success');

        } catch (error) {
            console.error('❌ Помилка оновлення:', error);
            this.showNotification('Помилка оновлення даних: ' + error.message, 'error');
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            this.refreshData();
        }, window.CONFIG.REFRESH_INTERVAL * 60 * 1000);
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('modals-container');
        const id = 'notification-' + Date.now();

        const colors = {
            info: 'bg-blue-500',
            success: 'bg-green-500',
            warning: 'bg-orange-500',
            error: 'bg-red-500'
        };

        const notification = document.createElement('div');
        notification.id = id;
        notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-xl z-50 transform transition-transform duration-300 translate-x-full`;
        notification.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-lg">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                <span>${message}</span>
                <button onclick="document.getElementById('${id}').remove()" class="ml-4 text-white/80 hover:text-white">✕</button>
            </div>
        `;

        container.appendChild(notification);

        setTimeout(() => {
            notification.classList.remove('translate-x-full');
            notification.classList.add('translate-x-0');
        }, 10);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('translate-x-0');
                notification.classList.add('translate-x-full');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 5000);
    }

    showError(message) {
        const container = document.getElementById('app');
        container.innerHTML = `
            <div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
                <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md backdrop-blur-sm">
                    <div class="text-center">
                        <div class="text-4xl text-red-400 mb-3">❌</div>
                        <h2 class="text-xl font-bold text-white mb-2">Помилка завантаження</h2>
                        <div class="text-red-200 text-sm mb-4">${message.substring(0, 200)}</div>
                        <div class="text-left text-xs text-blue-200 mb-4">
                            <p class="font-semibold">Можливі причини:</p>
                            <ul class="mt-1 space-y-1">
                                <li>• Неправильний API ключ</li>
                                <li>• Немає доступу до таблиці</li>
                                <li>• Проблеми з інтернетом</li>
                                <li>• Неправильні назви аркушів</li>
                            </ul>
                        </div>
                        <div class="flex gap-3">
                            <button onclick="location.reload()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                                Оновити сторінку
                            </button>
                            <button onclick="app.refreshData(true)" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                                Спробувати знову
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

window.app = null;

document.addEventListener('DOMContentLoaded', () => {
    window.app = new CarAnalyticsApp();
});
