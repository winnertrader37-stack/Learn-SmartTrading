"use strict";

/* =========================================================
   NAOL SMART TRADING
   File: script.js

   Features:
   - TradingView chart integration
   - Market and timeframe selection
   - Strategy selection
   - Trading plan validation
   - Local notes storage
   - JSON export/import
   - Responsive navigation

   IMPORTANT:
   This website does not execute broker orders.
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initializeNaolTrading();
});


function initializeNaolTrading() {
    /* =====================================================
       DOM HELPERS
    ===================================================== */

    const $ = (id) => document.getElementById(id);

    const welcomeView = $("welcomeView");
    const workspaceView = $("workspaceView");

    const runAnalysisButton = $("runAnalysis");
    const skipWelcomeButton = $("skipWelcome");
    const backHomeButton = $("backHome");

    const symbolSelect = $("symbolSelect");
    const timeframeSelect = $("timeframeSelect");
    const applyMarketButton = $("applyMarket");

    const chartTitle = $("chartTitle");
    const chartSubtitle = $("chartSubtitle");
    const chartStatus = $("chartStatus");
    const connectionStatus = $("connectionStatus");
    const marketMessage = $("marketMessage");

    const chartContainer = $("tradingviewChart");
    const chartFrame = $("chartFrame");

    const refreshChartButton = $("refreshChart");
    const fullscreenChartButton = $("fullscreenChart");

    const strategyLabel = $("selectedStrategyLabel");

    const analyzeMarketButton = $("analyzeMarket");
    const clearAnalysisButton = $("clearAnalysis");
    const analysisResult = $("analysisResult");

    const selectBuyButton = $("selectBuy");
    const selectSellButton = $("selectSell");

    const entryInput = $("entryInput");
    const slInput = $("slInput");
    const tpInput = $("tpInput");

    const drawPlanButton = $("drawPlan");
    const clearPlanButton = $("clearPlan");
    const planResult = $("planResult");

    const notesInput = $("notesInput");
    const saveNotesButton = $("saveNotes");
    const notesMessage = $("notesMessage");

    const exportButton = $("exportWork");
    const importButton = $("importWork");
    const importFile = $("importFile");

    const menuButton = $("menuButton");
    const mobileMenu = $("mobileMenu");

    const textDialog = $("textDialog");
    const textDialogForm = $("textDialogForm");
    const chartTextInput = $("chartTextInput");
    const cancelChartTextButton = $("cancelChartText");

    const toastMessage = $("toastMessage");

    /* =====================================================
       APPLICATION STATE
    ===================================================== */

    const STORAGE_KEY = "naol_smart_trading_v3";

    let selectedStrategy = "naol";
    let selectedDirection = "BUY";

    let currentSymbol =
        symbolSelect ? symbolSelect.value : "OANDA:XAUUSD";

    let currentTimeframe =
        timeframeSelect ? timeframeSelect.value : "5";

    let tradingViewWidget = null;

    let toastTimer = null;
    let chartReady = false;

    let chartLabels = [];

    let currentAnalysis = null;

    const strategyNames = {
        naol: "Naol Smart Strategy",
        ict: "Price Action + ICT",
        priceaction: "Price Action",
        ict_only: "ICT",
        smc: "Smart Money Concepts",
        manual: "Manual Strategy"
    };

    const timeframeNames = {
        "1": "1 minute",
        "5": "5 minutes",
        "15": "15 minutes",
        "30": "30 minutes",
        "60": "1 hour",
        "240": "4 hours",
        "1D": "1 day",
        "1W": "1 week"
    };

    const marketNames = {
        "OANDA:XAUUSD": "XAUUSD · Gold",
        "BINANCE:BTCUSDT": "BTCUSDT · Bitcoin",
        "BINANCE:ETHUSDT": "ETHUSDT · Ethereum",
        "FX:EURUSD": "EURUSD",
        "FX:GBPUSD": "GBPUSD",
        "FX:USDJPY": "USDJPY",
        "FX:AUDUSD": "AUDUSD",
        "NASDAQ:AAPL": "AAPL · Apple",
        "NASDAQ:TSLA": "TSLA · Tesla"
    };


    /* =====================================================
       GENERAL HELPERS
    ===================================================== */

    function showToast(message, duration = 3000) {
        if (!toastMessage) {
            return;
        }

        toastMessage.textContent = message;
        toastMessage.classList.add("show");

        if (toastTimer) {
            clearTimeout(toastTimer);
        }

        toastTimer = setTimeout(() => {
            toastMessage.classList.remove("show");
        }, duration);
    }


    function setMessage(element, message) {
        if (element) {
            element.textContent = message;
        }
    }


    function setChartStatus(message, state = "loading") {
        setMessage(chartStatus, message);

        if (connectionStatus) {
            connectionStatus.textContent = message;
        }

        const statusDots = document.querySelectorAll(
            ".header-status .status-dot, .chart-status .status-dot"
        );

        statusDots.forEach((dot) => {
            dot.classList.remove("is-connected", "is-error");

            if (state === "connected") {
                dot.classList.add("is-connected");
            } else if (state === "error") {
                dot.classList.add("is-error");
            }
        });
    }


    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function getSelectedMarketName() {
        return marketNames[currentSymbol] || currentSymbol;
    }


    function getSelectedTimeframeName() {
        return timeframeNames[currentTimeframe] ||
            currentTimeframe;
    }


    function getSavedState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (!raw) {
                return {};
            }

            const parsed = JSON.parse(raw);

            return parsed && typeof parsed === "object"
                ? parsed
                : {};

        } catch (error) {
            console.error("Could not load saved state:", error);
            return {};
        }
    }


    function saveState(state) {
        try {
            const previous = getSavedState();

            const merged = {
                ...previous,
                ...state
            };

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(merged)
            );

            return true;

        } catch (error) {
            console.error("Could not save state:", error);

            showToast(
                "Could not save data. Check browser storage settings."
            );

            return false;
        }
    }


    /* =====================================================
       WORKSPACE NAVIGATION
    ===================================================== */

    function openWorkspace() {
        if (welcomeView) {
            welcomeView.hidden = true;
        }

        if (workspaceView) {
            workspaceView.hidden = false;
        }

        updateStrategyLabel();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        loadTradingViewChart();

        closeMobileMenu();

        saveState({
            selectedStrategy,
            currentSymbol,
            currentTimeframe,
            lastView: "workspace"
        });
    }


    function openWelcome() {
        if (welcomeView) {
            welcomeView.hidden = false;
        }

        if (workspaceView) {
            workspaceView.hidden = true;
        }

        closeMobileMenu();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        saveState({
            selectedStrategy,
            currentSymbol,
            currentTimeframe,
            lastView: "welcome"
        });
    }


    if (runAnalysisButton) {
        runAnalysisButton.addEventListener(
            "click",
            openWorkspace
        );
    }


    if (skipWelcomeButton) {
        skipWelcomeButton.addEventListener(
            "click",
            openWorkspace
        );
    }


    if (backHomeButton) {
        backHomeButton.addEventListener(
            "click",
            openWelcome
        );
    }


    const brandHome = $("brandHome");

    if (brandHome) {
        brandHome.addEventListener("click", (event) => {
            event.preventDefault();
            openWelcome();
        });
    }


    /* =====================================================
       STRATEGY SELECTOR
    ===================================================== */

    function updateStrategyLabel() {
        if (strategyLabel) {
            strategyLabel.textContent =
                strategyNames[selectedStrategy] ||
                "Naol Smart Strategy";
        }

        document.querySelectorAll("[data-strategy]").forEach(
            (card) => {
                const isSelected =
                    card.dataset.strategy === selectedStrategy;

                card.setAttribute(
                    "aria-pressed",
                    String(isSelected)
                );
            }
        );
    }


    document.querySelectorAll("[data-strategy]").forEach(
        (card) => {
            card.addEventListener("click", () => {
                const strategy = card.dataset.strategy;

                if (!strategyNames[strategy]) {
                    return;
                }

                selectedStrategy = strategy;

                updateStrategyLabel();

                saveState({
                    selectedStrategy
                });

                showToast(
                    "Strategy selected: " +
                    strategyNames[selectedStrategy]
                );
            });
        }
    );


    /* =====================================================
       TRADINGVIEW CHART
    ===================================================== */

    function loadTradingViewChart() {
        if (!chartContainer) {
            setChartStatus(
                "Chart container was not found.",
                "error"
            );

            return;
        }

        if (typeof window.TradingView === "undefined") {
            setChartStatus(
                "Loading TradingView library...",
                "loading"
            );

            waitForTradingView();
            return;
        }

        createTradingViewWidget();
    }


    function waitForTradingView() {
        let attempts = 0;
        const maxAttempts = 25;

        const interval = setInterval(() => {
            attempts++;

            if (typeof window.TradingView !== "undefined") {
                clearInterval(interval);
                createTradingViewWidget();
                return;
            }

            if (attempts >= maxAttempts) {
                clearInterval(interval);

                setChartStatus(
                    "TradingView could not load. Check internet or content blockers.",
                    "error"
                );

                if (chartContainer) {
                    chartContainer.innerHTML = `
                        <div style="
                            display:flex;
                            flex-direction:column;
                            align-items:center;
                            justify-content:center;
                            min-height:300px;
                            height:100%;
                            padding:24px;
                            color:#d5e1f2;
                            text-align:center;
                            background:#0b111b;
                        ">
                            <strong style="font-size:17px;">
                                Chart unavailable
                            </strong>

                            <p style="
                                max-width:400px;
                                color:#9baac0;
                                font-size:13px;
                            ">
                                TradingView did not load.
                                Check your internet connection,
                                reload the page, and try again.
                            </p>

                            <button
                                type="button"
                                id="retryChartButton"
                                style="
                                    padding:11px 16px;
                                    border:1px solid #4b9cff;
                                    border-radius:9px;
                                    color:white;
                                    background:#2368d7;
                                    font-weight:700;
                                "
                            >
                                Retry chart
                            </button>
                        </div>
                    `;

                    const retryButton = $(
                        "retryChartButton"
                    );

                    if (retryButton) {
                        retryButton.addEventListener(
                            "click",
                            () => {
                                chartContainer.innerHTML = "";
                                loadTradingViewChart();
                            }
                        );
                    }
                }
            }
        }, 400);
    }


    function createTradingViewWidget() {
        if (!chartContainer || !window.TradingView) {
            return;
        }

        chartReady = false;

        setChartStatus(
            "Loading " + getSelectedMarketName() + "...",
            "loading"
        );

        chartContainer.innerHTML = "";

        const options = {
            autosize: true,

            symbol: currentSymbol,

            interval: currentTimeframe,

            timezone: "Etc/UTC",

            theme: "dark",

            style: "1",

            locale: "en",

            enable_publishing: false,

            allow_symbol_change: true,

            hide_side_toolbar: false,

            hide_top_toolbar: false,

            withdateranges: true,

            details: true,

            hotlist: false,

            calendar: false,

            studies: [],

            support_host: "https://www.tradingview.com",

            container_id: "tradingviewChart",

            backgroundColor: "#0b111b",

            gridColor: "rgba(42, 57, 81, 0.35)",

            overrides: {
                "paneProperties.background": "#0b111b",
                "paneProperties.backgroundType": "solid",
                "paneProperties.vertGridProperties.color":
                    "rgba(42, 57, 81, 0.35)",
                "paneProperties.horzGridProperties.color":
                    "rgba(42, 57, 81, 0.35)",
                "scalesProperties.textColor": "#9baac0",
                "mainSeriesProperties.candleStyle.upColor":
                    "#19d6a0",
                "mainSeriesProperties.candleStyle.downColor":
                    "#ff5c75",
                "mainSeriesProperties.candleStyle.borderUpColor":
                    "#19d6a0",
                "mainSeriesProperties.candleStyle.borderDownColor":
                    "#ff5c75",
                "mainSeriesProperties.candleStyle.wickUpColor":
                    "#19d6a0",
                "mainSeriesProperties.candleStyle.wickDownColor":
                    "#ff5c75"
            },

            loading_screen: {
                backgroundColor: "#0b111b",
                foregroundColor: "#4b9cff"
            },

            studies_overrides: {}
        };

        try {
            tradingViewWidget =
                new window.TradingView.widget(options);

            /*
             * TradingView's embed API does not expose every
             * chart data detail to the parent website.
             *
             * This event confirms widget readiness, not that
             * every instrument has exchange-level real-time data.
             */

            if (
                tradingViewWidget &&
                typeof tradingViewWidget.onChartReady === "function"
            ) {
                tradingViewWidget.onChartReady(() => {
                    chartReady = true;

                    setChartStatus(
                        "Chart loaded · verify exchange data status",
                        "connected"
                    );

                    updateChartLabels();

                    showToast("TradingView chart loaded.");
                });
            } else {
                setChartStatus(
                    "Chart requested. Waiting for provider.",
                    "loading"
                );
            }

        } catch (error) {
            console.error(
                "TradingView widget error:",
                error
            );

            setChartStatus(
                "Could not create chart. Try refreshing.",
                "error"
            );
        }
    }


    function updateChartLabels() {
        if (chartTitle) {
            chartTitle.textContent =
                getSelectedMarketName();
        }

        if (chartSubtitle) {
            chartSubtitle.textContent =
                getSelectedTimeframeName() + " chart";
        }
    }


    function applyMarketSettings() {
        if (symbolSelect) {
            currentSymbol = symbolSelect.value;
        }

        if (timeframeSelect) {
            currentTimeframe = timeframeSelect.value;
        }

        updateChartLabels();

        setMessage(
            marketMessage,
            "Selected " +
            getSelectedMarketName() +
            " · " +
            getSelectedTimeframeName()
        );

        saveState({
            currentSymbol,
            currentTimeframe
        });

        loadTradingViewChart();

        showToast(
            "Market settings updated."
        );
    }


    if (applyMarketButton) {
        applyMarketButton.addEventListener(
            "click",
            applyMarketSettings
        );
    }


    if (symbolSelect) {
        symbolSelect.addEventListener("change", () => {
            setMessage(
                marketMessage,
                "Market selected. Press Apply Market to update chart."
            );
        });
    }


    if (timeframeSelect) {
        timeframeSelect.addEventListener("change", () => {
            setMessage(
                marketMessage,
                "Timeframe selected. Press Apply Market to update chart."
            );
        });
    }


    if (refreshChartButton) {
        refreshChartButton.addEventListener("click", () => {
            loadTradingViewChart();
        });
    }


    if (fullscreenChartButton) {
        fullscreenChartButton.addEventListener("click", async () => {
            if (!chartFrame) {
                return;
            }

            try {
                if (!document.fullscreenElement) {
                    if (chartFrame.requestFullscreen) {
                        await chartFrame.requestFullscreen();
                    } else {
                        showToast(
                            "Fullscreen is not supported in this browser."
                        );
                    }
                } else {
                    await document.exitFullscreen();
                }
            } catch (error) {
                console.error(
                    "Fullscreen error:",
                    error
                );

                showToast(
                    "Could not open fullscreen mode."
                );
            }
        });
    }


    /* =====================================================
       ANALYSIS ENGINE
       IMPORTANT:
       The embedded TradingView widget does not expose its
       live candle data to this page through the standard
       widget API.

       Therefore, this analysis is a structured checklist,
       not an automated reading of live candles.
    ===================================================== */

    function getStrategyChecklist(strategy) {
        const common = [
            "Check the higher-timeframe trend.",
            "Identify nearby support and resistance.",
            "Look for a clear swing high or swing low.",
            "Confirm the candle close before deciding.",
            "Check spread, volatility and upcoming news."
        ];

        const strategySpecific = {
            naol: [
                "Review market structure and direction.",
                "Identify potential liquidity areas.",
                "Look for a fair value gap or displacement.",
                "Require multiple confirmations before entry."
            ],

            ict: [
                "Check for a liquidity sweep.",
                "Review market structure shift.",
                "Identify displacement and fair value gaps.",
                "Wait for price action confirmation."
            ],

            priceaction: [
                "Check trend and swing structure.",
                "Identify support and resistance.",
                "Look for candle rejection or continuation.",
                "Confirm the breakout or retest."
            ],

            ict_only: [
                "Review premium and discount zones.",
                "Mark relevant liquidity pools.",
                "Check market structure shift.",
                "Review fair value gaps and displacement."
            ],

            smc: [
                "Identify break of structure (BOS).",
                "Check for change of character (CHoCH).",
                "Identify order-block candidates.",
                "Wait for a confirmed retest."
            ],

            manual: [
                "Record your market direction.",
                "Mark support and resistance.",
                "Define a clear entry condition.",
                "Define invalidation before entry."
            ]
        };

        return [
            ...common,
            ...(strategySpecific[strategy] || strategySpecific.naol)
        ];
    }


    function runMarketAnalysis() {
        if (!analysisResult) {
            return;
        }

        const checklist =
            getStrategyChecklist(selectedStrategy);

        currentAnalysis = {
            strategy: selectedStrategy,
            strategyName: strategyNames[selectedStrategy],
            symbol: currentSymbol,
            marketName: getSelectedMarketName(),
            timeframe: currentTimeframe,
            timeframeName: getSelectedTimeframeName(),
            createdAt: new Date().toISOString(),
            checklist
        };

        analysisResult.innerHTML = `
            <div class="analysis-summary">

                <div class="metric-card">
                    <span class="metric-label">
                        Selected Market
                    </span>

                    <strong class="metric-value">
                        ${escapeHTML(getSelectedMarketName())}
                    </strong>
                </div>

                <div class="metric-card">
                    <span class="metric-label">
                        Timeframe
                    </span>

                    <strong class="metric-value">
                        ${escapeHTML(getSelectedTimeframeName())}
                    </strong>
                </div>

                <div class="metric-card">
                    <span class="metric-label">
                        Analysis Status
                    </span>

                    <strong class="metric-value neutral-text">
                        REVIEW
                    </strong>
                </div>

            </div>

            <div class="analysis-detail">

                <h3>
                    ${escapeHTML(strategyNames[selectedStrategy])}
                    · Checklist
                </h3>

                <p class="muted-text">
                    Review these conditions against the visible
                    TradingView chart. This checklist does not
                    automatically read live candles or generate
                    a verified BUY/SELL signal.
                </p>

                <ul class="analysis-list">
                    ${checklist.map((item) => `
                        <li>${escapeHTML(item)}</li>
                    `).join("")}
                </ul>

            </div>
        `;

        saveState({
            currentAnalysis
        });

        showToast(
            "Analysis checklist generated."
        );
    }


    if (analyzeMarketButton) {
        analyzeMarketButton.addEventListener(
            "click",
            runMarketAnalysis
        );
    }


    if (clearAnalysisButton) {
        clearAnalysisButton.addEventListener("click", () => {
            currentAnalysis = null;

            if (analysisResult) {
                analysisResult.innerHTML = `
                    <div class="result-placeholder">

                        <span class="result-placeholder-icon">⌁</span>

                        <strong>Ready to analyze</strong>

                        <p>
                            Select a market, inspect its chart and
                            press Analyze Market.
                        </p>

                    </div>
                `;
            }

            saveState({
                currentAnalysis: null
            });

            showToast("Analysis results cleared.");
        });
    }


    /* =====================================================
       BUY / SELL DIRECTION
    ===================================================== */

    function setDirection(direction) {
        selectedDirection = direction;

        if (selectBuyButton) {
            selectBuyButton.setAttribute(
                "aria-pressed",
                String(direction === "BUY")
            );
        }

        if (selectSellButton) {
            selectSellButton.setAttribute(
                "aria-pressed",
                String(direction === "SELL")
            );
        }

        saveState({
            selectedDirection
        });
    }


    if (selectBuyButton) {
        selectBuyButton.addEventListener("click", () => {
            setDirection("BUY");
            showToast("BUY direction selected.");
        });
    }


    if (selectSellButton) {
        selectSellButton.addEventListener("click", () => {
            setDirection("SELL");
            showToast("SELL direction selected.");
        });
    }


    /* =====================================================
       TRADING PLAN VALIDATION
    ===================================================== */

    function readPrice(input) {
        if (!input || input.value.trim() === "") {
            return null;
        }

        const value = Number(input.value);

        return Number.isFinite(value) && value > 0
            ? value
            : null;
    }


    function showPlanMessage(message, type = "") {
        if (!planResult) {
            return;
        }

        planResult.innerHTML = `
            <div class="plan-message ${escapeHTML(type)}">
                ${escapeHTML(message)}
            </div>
        `;
    }


    function validateTradingPlan() {
        const entry = readPrice(entryInput);
        const stopLoss = readPrice(slInput);
        const takeProfit = readPrice(tpInput);

        if (
            entry === null ||
            stopLoss === null ||
            takeProfit === null
        ) {
            showPlanMessage(
                "Enter valid positive prices for Entry, Stop Loss and Take Profit.",
                "error"
            );

            return;
        }

        if (selectedDirection === "BUY") {
            if (stopLoss >= entry) {
                showPlanMessage(
                    "For a BUY plan, Stop Loss must be below Entry.",
                    "error"
                );

                return;
            }

            if (takeProfit <= entry) {
                showPlanMessage(
                    "For a BUY plan, Take Profit must be above Entry.",
                    "error"
                );

                return;
            }
        } else {
            if (stopLoss <= entry) {
                showPlanMessage(
                    "For a SELL plan, Stop Loss must be above Entry.",
                    "error"
                );

                return;
            }

            if (takeProfit >= entry) {
                showPlanMessage(
                    "For a SELL plan, Take Profit must be below Entry.",
                    "error"
                );

                return;
            }
        }

        const risk = Math.abs(entry - stopLoss);
        const reward = Math.abs(takeProfit - entry);

        const riskReward = reward / risk;

        const plan = {
            symbol: currentSymbol,
            marketName: getSelectedMarketName(),
            timeframe: currentTimeframe,
            direction: selectedDirection,
            entry,
            stopLoss,
            takeProfit,
            risk,
            reward,
            riskReward,
            strategy: selectedStrategy,
            createdAt: new Date().toISOString()
        };

        saveState({
            latestTradingPlan: plan
        });

        showPlanMessage(
            "Plan valid. Direction: " +
            selectedDirection +
            ". Risk distance: " +
            risk.toFixed(5) +
            ". Reward distance: " +
            reward.toFixed(5) +
            ". Risk/reward ratio: 1:" +
            riskReward.toFixed(2) +
            ". This plan has not been sent to a broker.",
            "success"
        );

        showToast("Trading plan validated.");
    }


    if (drawPlanButton) {
        drawPlanButton.addEventListener(
            "click",
            validateTradingPlan
        );
    }


    if (clearPlanButton) {
        clearPlanButton.addEventListener("click", () => {
            if (entryInput) entryInput.value = "";
            if (slInput) slInput.value = "";
            if (tpInput) tpInput.value = "";

            if (planResult) {
                planResult.innerHTML = "";
            }

            saveState({
                latestTradingPlan: null
            });

            showToast("Trading plan cleared.");
        });
    }


    /* =====================================================
       NOTES
    ===================================================== */

    function loadNotes() {
        const saved = getSavedState();

        if (notesInput && typeof saved.notes === "string") {
            notesInput.value = saved.notes;
        }
    }


    if (saveNotesButton) {
        saveNotesButton.addEventListener("click", () => {
            const notes = notesInput
                ? notesInput.value
                : "";

            const success = saveState({
                notes,
                notesUpdatedAt: new Date().toISOString()
            });

            if (success) {
                setMessage(
                    notesMessage,
                    "Notes saved in this browser."
                );

                showToast("Notes saved.");
            }
        });
    }


    /* =====================================================
       EXPORT
    ===================================================== */

    function downloadJSON(filename, data) {
        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            {
                type: "application/json"
            }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
    }


    if (exportButton) {
        exportButton.addEventListener("click", () => {
            const state = getSavedState();

            state.exportedAt = new Date().toISOString();
            state.appName = "NAOL SMART TRADING";

            downloadJSON(
                "naol-smart-trading-backup.json",
                state
            );

            showToast("Export file created.");
        });
    }


    /* =====================================================
       IMPORT
    ===================================================== */

    if (importButton && importFile) {
        importButton.addEventListener("click", () => {
            importFile.click();
        });

        importFile.addEventListener("change", async () => {
            const file =
                importFile.files && importFile.files[0];

            if (!file) {
                return;
            }

            try {
                const text = await file.text();
                const imported = JSON.parse(text);

                if (
                    !imported ||
                    typeof imported !== "object" ||
                    Array.isArray(imported)
                ) {
                    throw new Error(
                        "Invalid backup format."
                    );
                }

                const allowedKeys = [
                    "selectedStrategy",
                    "currentSymbol",
                    "currentTimeframe",
                    "selectedDirection",
                    "notes",
                    "latestTradingPlan",
                    "currentAnalysis"
                ];

                const cleanData = {};

                allowedKeys.forEach((key) => {
                    if (
                        Object.prototype.hasOwnProperty.call(
                            imported,
                            key
                        )
                    ) {
                        cleanData[key] = imported[key];
                    }
                });

                const allowedStrategies =
                    Object.keys(strategyNames);

                if (
                    cleanData.selectedStrategy &&
                    !allowedStrategies.includes(
                        cleanData.selectedStrategy
                    )
                ) {
                    delete cleanData.selectedStrategy;
                }

                const validSymbols = Array.from(
                    symbolSelect.options
                ).map((option) => option.value);

                if (
                    cleanData.currentSymbol &&
                    !validSymbols.includes(
                        cleanData.currentSymbol
                    )
                ) {
                    delete cleanData.currentSymbol;
                }

                const validTimeframes = [
                    "1",
                    "5",
                    "15",
                    "30",
                    "60",
                    "240",
                    "1D",
                    "1W"
                ];

                if (
                    cleanData.currentTimeframe &&
                    !validTimeframes.includes(
                        cleanData.currentTimeframe
                    )
                ) {
                    delete cleanData.currentTimeframe;
                }

                const previous = getSavedState();

                const combined = {
                    ...previous,
                    ...cleanData
                };

                localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(combined)
                );

                restoreSavedSettings();

                setMessage(
                    notesMessage,
                    "Backup imported successfully."
                );

                showToast(
                    "Import complete. Settings restored."
                );

            } catch (error) {
                console.error(
                    "Import error:",
                    error
                );

                showToast(
                    "Import failed. Choose a valid NAOL JSON backup."
                );
            } finally {
                importFile.value = "";
            }
        });
    }


    /* =====================================================
       MOBILE NAVIGATION
    ===================================================== */

    function closeMobileMenu() {
        if (mobileMenu) {
            mobileMenu.hidden = true;
        }

        if (menuButton) {
            menuButton.setAttribute(
                "aria-expanded",
                "false"
            );
        }
    }


    if (menuButton && mobileMenu) {
        menuButton.addEventListener("click", () => {
            const opening = mobileMenu.hidden;

            mobileMenu.hidden = !opening;

            menuButton.setAttribute(
                "aria-expanded",
                String(opening)
            );
        });
    }


    document.querySelectorAll("[data-scroll]").forEach(
        (button) => {
            button.addEventListener("click", () => {
                const targetId = button.dataset.scroll;
                const target = $(targetId);

                if (target) {
                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }

                closeMobileMenu();
            });
        }
    );


    /* =====================================================
       CHART TEXT DIALOG

       This saves labels in local state only. It does not
       draw inside the embedded TradingView chart.
    ===================================================== */

    if (textDialogForm) {
        textDialogForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const label = chartTextInput
                ? chartTextInput.value.trim()
                : "";

            if (!label) {
                showToast("Enter a chart label first.");
                return;
            }

            chartLabels.push({
                text: label,
                symbol: currentSymbol,
                createdAt: new Date().toISOString()
            });

            saveState({
                chartLabels
            });

            if (
                textDialog &&
                typeof textDialog.close === "function"
            ) {
                textDialog.close();
            }

            if (chartTextInput) {
                chartTextInput.value = "";
            }

            showToast(
                "Chart label saved to your workspace."
            );
        });
    }


    if (cancelChartTextButton && textDialog) {
        cancelChartTextButton.addEventListener("click", () => {
            if (typeof textDialog.close === "function") {
                textDialog.close();
            }
        });
    }


    /* =====================================================
       RESTORE SETTINGS
    ===================================================== */

    function restoreSavedSettings() {
        const saved = getSavedState();

        if (
            saved.selectedStrategy &&
            strategyNames[saved.selectedStrategy]
        ) {
            selectedStrategy = saved.selectedStrategy;
        }

        if (saved.currentSymbol && symbolSelect) {
            const symbolExists = Array.from(
                symbolSelect.options
            ).some(
                (option) =>
                    option.value === saved.currentSymbol
            );

            if (symbolExists) {
                currentSymbol = saved.currentSymbol;
                symbolSelect.value = currentSymbol;
            }
        }

        if (saved.currentTimeframe && timeframeSelect) {
            const timeframeExists = Array.from(
                timeframeSelect.options
            ).some(
                (option) =>
                    option.value === saved.currentTimeframe
            );

            if (timeframeExists) {
                currentTimeframe = saved.currentTimeframe;
                timeframeSelect.value = currentTimeframe;
            }
        }

        if (
            saved.selectedDirection === "BUY" ||
            saved.selectedDirection === "SELL"
        ) {
            selectedDirection = saved.selectedDirection;
        }

        if (
            saved.chartLabels &&
            Array.isArray(saved.chartLabels)
        ) {
            chartLabels = saved.chartLabels;
        }

        updateStrategyLabel();
        updateChartLabels();

        setDirection(selectedDirection);

        if (notesInput && typeof saved.notes === "string") {
            notesInput.value = saved.notes;
        }
    }


    /* =====================================================
       ERROR HANDLING
    ===================================================== */

    window.addEventListener("error", (event) => {
        console.error(
            "NAOL application error:",
            event.message,
            event.filename,
            event.lineno
        );
    });


    window.addEventListener(
        "unhandledrejection",
        (event) => {
            console.error(
                "NAOL asynchronous error:",
                event.reason
            );
        }
    );


    /* =====================================================
       STARTUP
    ===================================================== */

    restoreSavedSettings();

    loadNotes();

    updateChartLabels();

    setDirection(selectedDirection);

    setChartStatus(
        "Ready. Open workspace to load chart.",
        "loading"
    );

    /*
     * Do not automatically hide the strategy selector.
     * The user can choose a strategy before entering
     * the trading workspace.
     */

    const initialState = getSavedState();

    if (initialState.lastView === "workspace") {
        openWorkspace();
    }

    console.log(
        "NAOL SMART TRADING initialized successfully."
    );
}
