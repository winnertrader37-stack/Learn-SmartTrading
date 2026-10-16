"use strict";

/* =========================================================
   NAOL SMART TRADING
   File: script.js

   Rule-based trading education and chart analysis.
   No AI API, no broker execution, no guaranteed profits.
   Demo candles are generated locally.
   ========================================================= */

(() => {
  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const byId = (id) => document.getElementById(id);

  const STORAGE_KEY = "naol-smart-trading-v1";

  const CONFIG = {
    initialCandles: 150,
    maxCandles: 350,
    atrPeriod: 14,
    emaFast: 20,
    emaMedium: 50,
    emaSlow: 200,
    swingStrength: 2,
    scoreThreshold: 60,
    defaultRR: 2,
    padding: {
      top: 25,
      right: 65,
      bottom: 32,
      left: 12
    }
  };

  const state = {
    strategy: null,
    symbol: "XAUUSD",
    timeframe: "M5",
    mode: "analysis",

    candles: [],
    drawings: [],
    undoStack: [],

    activeTool: "select",
    selectedDrawing: null,
    drawingStart: null,
    drawingPreview: null,

    zoom: 1,
    panOffset: 0,
    gridVisible: true,

    analysis: null,
    lastPrice: null,

    tradeDirection: "BUY",
    entry: "",
    sl: "",
    tp: "",

    notes: "",
    initialized: false,

    mouse: {
      x: 0,
      y: 0,
      down: false,
      dragging: false,
      lastX: 0,
      lastY: 0
    }
  };

  let canvas = null;
  let ctx = null;
  let chartRect = null;
  let resizeObserver = null;
  let toastTimer = null;
  let saveTimer = null;

  /* =======================================================
     1. GENERAL HELPERS
     ======================================================= */

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mean(values) {
    if (!values.length) return 0;

    return values.reduce((sum, value) => sum + value, 0) /
      values.length;
  }

  function round(value, decimals = 2) {
    if (!Number.isFinite(value)) return 0;

    const factor = 10 ** decimals;

    return Math.round(value * factor) / factor;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]
    );
  }

  function formatPrice(value) {
    if (!Number.isFinite(value)) return "--";

    const digits =
      state.symbol === "BTCUSD" ||
      state.symbol === "ETHUSD"
        ? 2
        : state.symbol.includes("JPY")
          ? 3
          : 2;

    return value.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function showToast(message, type = "success") {
    const toast = byId("toast");

    if (!toast) {
      console.log(`[${type}] ${message}`);
      return;
    }

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.className = "toast";
    }, 3000);
  }

  function setText(id, value) {
    const element = byId(id);

    if (element) {
      element.textContent = String(value ?? "");
    }
  }

  function setHTML(id, value) {
    const element = byId(id);

    if (element) {
      element.innerHTML = value;
    }
  }

  function addClass(element, className) {
    if (element) element.classList.add(className);
  }

  function removeClass(element, className) {
    if (element) element.classList.remove(className);
  }

  function setHidden(element, hidden) {
    if (!element) return;

    element.classList.toggle("hidden", hidden);
  }

  function setActive(buttons, selected, attribute = "data-tool") {
    buttons.forEach((button) => {
      const active = button.getAttribute(attribute) === selected;

      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function getElementValue(id, fallback = "") {
    const element = byId(id);

    return element ? element.value : fallback;
  }

  function numberFromInput(id) {
    const value = Number(getElementValue(id));

    return Number.isFinite(value) ? value : NaN;
  }

  function debounceSave() {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(saveState, 250);
  }

  /* =======================================================
     2. CANDLE DATA

     IMPORTANT:
     These candles are generated demo data.
     They are not real-time broker prices.
     ======================================================= */

  function getTimeframeMilliseconds(timeframe) {
    const map = {
      M1: 60_000,
      M5: 300_000,
      M15: 900_000,
      M30: 1_800_000,
      H1: 3_600_000,
      H4: 14_400_000,
      D1: 86_400_000
    };

    return map[timeframe] || 300_000;
  }

  function getBasePrice(symbol) {
    const map = {
      XAUUSD: 2700,
      BTCUSD: 65000,
      ETHUSD: 2500,
      EURUSD: 1.08,
      SILVERUSDT: 31
    };

    return map[symbol] || 100;
  }

  function getVolatility(symbol) {
    const map = {
      XAUUSD: 3.2,
      BTCUSD: 250,
      ETHUSD: 18,
      EURUSD: 0.0018,
      SILVERUSDT: 0.22
    };

    return map[symbol] || 1;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;

    return function random() {
      value += 0x6D2B79F5;

      let t = value;

      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createDemoCandles(count = CONFIG.initialCandles) {
    const base = getBasePrice(state.symbol);
    const volatility = getVolatility(state.symbol);

    const random = seededRandom(
      Date.now() +
      state.symbol.length * 1237 +
      state.timeframe.length * 77
    );

    const candles = [];

    let price = base;

    const now = Date.now();
    const interval = getTimeframeMilliseconds(state.timeframe);

    let momentum = 0;

    for (let i = count - 1; i >= 0; i--) {
      const time = now - i * interval;

      if (random() > 0.82) {
        momentum = (random() - 0.5) * volatility * 0.9;
      } else {
        momentum *= 0.68;
      }

      const open = price;

      const noise = (random() - 0.5) * volatility;

      const change = noise + momentum;

      const close = Math.max(
        base * 0.05,
        open + change
      );

      const wickUp = random() * volatility * 0.65;
      const wickDown = random() * volatility * 0.65;

      const high = Math.max(open, close) + wickUp;
      const low = Math.min(open, close) - wickDown;

      candles.push({
        time,
        open,
        high,
        low,
        close,
        volume: Math.round(100 + random() * 1500)
      });

      price = close;
    }

    return candles;
  }

  function regenerateCandles() {
    state.candles = createDemoCandles();
    state.lastPrice = state.candles.at(-1)?.close ?? null;

    state.panOffset = 0;

    analyzeMarket();
    renderChart();
    updatePriceDisplay();
    updateChartBadges();
    debounceSave();
  }

  /* =======================================================
     3. TECHNICAL INDICATORS
     ======================================================= */

  function calculateEMA(candles, period) {
    if (!candles.length) return [];

    const multiplier = 2 / (period + 1);

    const output = [];
    let previous = candles[0].close;

    for (let i = 0; i < candles.length; i++) {
      const close = candles[i].close;

      if (i === 0) {
        previous = close;
      } else {
        previous =
          close * multiplier +
          previous * (1 - multiplier);
      }

      output.push(previous);
    }

    return output;
  }

  function calculateATR(candles, period = 14) {
    if (!candles.length) return [];

    const trueRanges = [];

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const previousClose =
        i > 0 ? candles[i - 1].close : candle.close;

      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose)
      );

      trueRanges.push(tr);
    }

    return trueRanges.map((_, i) => {
      const start = Math.max(0, i - period + 1);

      return mean(trueRanges.slice(start, i + 1));
    });
  }

  function calculateRSI(candles, period = 14) {
    const result = Array(candles.length).fill(50);

    if (candles.length < 2) return result;

    for (let i = 1; i < candles.length; i++) {
      const start = Math.max(1, i - period + 1);

      let gains = 0;
      let losses = 0;

      for (let j = start; j <= i; j++) {
        const difference =
          candles[j].close - candles[j - 1].close;

        if (difference >= 0) {
          gains += difference;
        } else {
          losses += Math.abs(difference);
        }
      }

      const count = Math.max(1, i - start + 1);
      const averageGain = gains / count;
      const averageLoss = losses / count;

      if (averageLoss === 0) {
        result[i] = averageGain === 0 ? 50 : 100;
      } else {
        const rs = averageGain / averageLoss;

        result[i] = 100 - 100 / (1 + rs);
      }
    }

    return result;
  }

  /* =======================================================
     4. SWING STRUCTURE
     ======================================================= */

  function findSwings(candles, strength = CONFIG.swingStrength) {
    const highs = [];
    const lows = [];

    for (
      let i = strength;
      i < candles.length - strength;
      i++
    ) {
      const candle = candles[i];

      let isHigh = true;
      let isLow = true;

      for (let j = i - strength; j <= i + strength; j++) {
        if (j === i) continue;

        if (candles[j].high >= candle.high) {
          isHigh = false;
        }

        if (candles[j].low <= candle.low) {
          isLow = false;
        }
      }

      if (isHigh) {
        highs.push({
          index: i,
          price: candle.high,
          time: candle.time
        });
      }

      if (isLow) {
        lows.push({
          index: i,
          price: candle.low,
          time: candle.time
        });
      }
    }

    return { highs, lows };
  }

  function detectStructure(candles, swings) {
    if (candles.length < 5) {
      return {
        trend: "NEUTRAL",
        bos: "NONE",
        choch: "NONE",
        swingHigh: null,
        swingLow: null
      };
    }

    const last = candles.at(-1);

    const priorHighs = swings.highs.filter(
      (item) => item.index < candles.length - 1
    );

    const priorLows = swings.lows.filter(
      (item) => item.index < candles.length - 1
    );

    const swingHigh = priorHighs.at(-1) || null;
    const swingLow = priorLows.at(-1) || null;

    let bos = "NONE";

    if (swingHigh && last.close > swingHigh.price) {
      bos = "BULLISH";
    } else if (swingLow && last.close < swingLow.price) {
      bos = "BEARISH";
    }

    let trend = "NEUTRAL";

    if (priorHighs.length >= 2 && priorLows.length >= 2) {
      const h1 = priorHighs.at(-2).price;
      const h2 = priorHighs.at(-1).price;

      const l1 = priorLows.at(-2).price;
      const l2 = priorLows.at(-1).price;

      if (h2 > h1 && l2 > l1) {
        trend = "BULLISH";
      } else if (h2 < h1 && l2 < l1) {
        trend = "BEARISH";
      }
    }

    if (trend === "NEUTRAL" && bos !== "NONE") {
      trend = bos;
    }

    let choch = "NONE";

    if (
      trend === "BULLISH" &&
      swingLow &&
      last.close < swingLow.price
    ) {
      choch = "BEARISH";
    } else if (
      trend === "BEARISH" &&
      swingHigh &&
      last.close > swingHigh.price
    ) {
      choch = "BULLISH";
    }

    return {
      trend,
      bos,
      choch,
      swingHigh,
      swingLow
    };
  }

  /* =======================================================
     5. CANDLE PATTERNS
     ======================================================= */

  function detectCandlePatterns(candles) {
    if (candles.length < 2) {
      return {
        bullishEngulfing: false,
        bearishEngulfing: false,
        bullishPin: false,
        bearishPin: false
      };
    }

    const current = candles.at(-1);
    const previous = candles.at(-2);

    const body = Math.abs(current.close - current.open);

    const safeBody = Math.max(body, 0.00000001);

    const upperWick =
      current.high - Math.max(current.open, current.close);

    const lowerWick =
      Math.min(current.open, current.close) - current.low;

    const bullishEngulfing =
      previous.close < previous.open &&
      current.close > current.open &&
      current.open <= previous.close &&
      current.close >= previous.open;

    const bearishEngulfing =
      previous.close > previous.open &&
      current.close < current.open &&
      current.open >= previous.close &&
      current.close <= previous.open;

    const bullishPin =
      lowerWick >= safeBody * 2 &&
      upperWick <= safeBody &&
      current.close > current.open;

    const bearishPin =
      upperWick >= safeBody * 2 &&
      lowerWick <= safeBody &&
      current.close < current.open;

    return {
      bullishEngulfing,
      bearishEngulfing,
      bullishPin,
      bearishPin
    };
  }

  /* =======================================================
     6. FVG AND LIQUIDITY SWEEPS
     ======================================================= */

  function detectFVG(candles) {
    if (candles.length < 3) {
      return {
        bullish: null,
        bearish: null
      };
    }

    const last = candles.at(-1);
    const twoAgo = candles.at(-3);

    let bullish = null;
    let bearish = null;

    if (last.low > twoAgo.high) {
      bullish = {
        low: twoAgo.high,
        high: last.low,
        index: candles.length - 1
      };
    }

    if (last.high < twoAgo.low) {
      bearish = {
        low: last.high,
        high: twoAgo.low,
        index: candles.length - 1
      };
    }

    return { bullish, bearish };
  }

  function detectLiquiditySweep(candles, swings) {
    if (!candles.length) {
      return {
        bullish: false,
        bearish: false
      };
    }

    const current = candles.at(-1);

    const previousLows = swings.lows.filter(
      (item) => item.index < candles.length - 1
    );

    const previousHighs = swings.highs.filter(
      (item) => item.index < candles.length - 1
    );

    const swingLow = previousLows.at(-1);
    const swingHigh = previousHighs.at(-1);

    const bullish =
      !!swingLow &&
      current.low < swingLow.price &&
      current.close > swingLow.price;

    const bearish =
      !!swingHigh &&
      current.high > swingHigh.price &&
      current.close < swingHigh.price;

    return { bullish, bearish };
  }

  /* =======================================================
     7. SUPPORT AND RESISTANCE
     ======================================================= */

  function detectSupportResistance(candles, swings, atr) {
    const last = candles.at(-1);

    if (!last) {
      return {
        support: null,
        resistance: null
      };
    }

    const tolerance = Math.max(atr * 0.2, 0.0000001);

    const supports = swings.lows.filter(
      (item) => item.price <= last.close + tolerance
    );

    const resistances = swings.highs.filter(
      (item) => item.price >= last.close - tolerance
    );

    supports.sort(
      (a, b) =>
        Math.abs(last.close - a.price) -
        Math.abs(last.close - b.price)
    );

    resistances.sort(
      (a, b) =>
        Math.abs(a.price - last.close) -
        Math.abs(b.price - last.close)
    );

    return {
      support: supports[0] || null,
      resistance: resistances[0] || null
    };
  }

  /* =======================================================
     8. ORDER BLOCK CANDIDATES
     ======================================================= */

  function detectOrderBlocks(candles, atr) {
    if (candles.length < 5) {
      return {
        bullish: null,
        bearish: null
      };
    }

    const bullishCandidates = [];
    const bearishCandidates = [];

    const start = Math.max(1, candles.length - 30);

    for (let i = start; i < candles.length; i++) {
      const candle = candles[i];

      const range = candle.high - candle.low;
      const body = Math.abs(candle.close - candle.open);

      if (range <= 0) continue;

      const displacement =
        range >= atr * 0.7 &&
        body >= atr * 0.5;

      if (!displacement) continue;

      const previous = candles[i - 1];

      if (
        candle.close > candle.open &&
        previous.close < previous.open
      ) {
        bullishCandidates.push({
          low: previous.low,
          high: previous.high,
          index: i - 1
        });
      }

      if (
        candle.close < candle.open &&
        previous.close > previous.open
      ) {
        bearishCandidates.push({
          low: previous.low,
          high: previous.high,
          index: i - 1
        });
      }
    }

    return {
      bullish: bullishCandidates.at(-1) || null,
      bearish: bearishCandidates.at(-1) || null
    };
  }

  /* =======================================================
     9. MARKET ANALYSIS
     ======================================================= */

  function analyzeMarket() {
    const candles = state.candles;

    if (candles.length < 10) {
      state.analysis = {
        direction: "WAIT",
        reason: "Not enough candles",
        score: 0
      };

      updateAnalysisUI();

      return state.analysis;
    }

    const ema20 = calculateEMA(candles, CONFIG.emaFast);
    const ema50 = calculateEMA(candles, CONFIG.emaMedium);
    const ema200 = calculateEMA(candles, CONFIG.emaSlow);

    const atrValues = calculateATR(
      candles,
      CONFIG.atrPeriod
    );

    const rsiValues = calculateRSI(candles, 14);

    const swings = findSwings(candles);

    const structure = detectStructure(candles, swings);

    const patterns = detectCandlePatterns(candles);

    const fvg = detectFVG(candles);

    const liquidity = detectLiquiditySweep(
      candles,
      swings
    );

    const current = candles.at(-1);

    const atr = atrValues.at(-1) || 0;

    const supportResistance = detectSupportResistance(
      candles,
      swings,
      atr
    );

    const orderBlocks = detectOrderBlocks(
      candles,
      atr
    );

    const trendBullish =
      current.close > ema20.at(-1) &&
      ema20.at(-1) > ema50.at(-1);

    const trendBearish =
      current.close < ema20.at(-1) &&
      ema20.at(-1) < ema50.at(-1);

    const macroBullish =
      ema50.at(-1) > ema200.at(-1);

    const macroBearish =
      ema50.at(-1) < ema200.at(-1);

    const bullishPA =
      trendBullish &&
      (
        patterns.bullishEngulfing ||
        patterns.bullishPin
      );

    const bearishPA =
      trendBearish &&
      (
        patterns.bearishEngulfing ||
        patterns.bearishPin
      );

    const bullishICT =
      liquidity.bullish &&
      (
        patterns.bullishEngulfing ||
        patterns.bullishPin ||
        structure.bos === "BULLISH"
      );

    const bearishICT =
      liquidity.bearish &&
      (
        patterns.bearishEngulfing ||
        patterns.bearishPin ||
        structure.bos === "BEARISH"
      );

    const bullishSMC =
      structure.choch === "BULLISH" ||
      (
        structure.bos === "BULLISH" &&
        !!orderBlocks.bullish
      );

    const bearishSMC =
      structure.choch === "BEARISH" ||
      (
        structure.bos === "BEARISH" &&
        !!orderBlocks.bearish
      );

    const checks = {
      trendBullish,
      trendBearish,
      macroBullish,
      macroBearish,

      bullishPA,
      bearishPA,

      bullishICT,
      bearishICT,

      bullishSMC,
      bearishSMC,

      bullishEngulfing: patterns.bullishEngulfing,
      bearishEngulfing: patterns.bearishEngulfing,

      bullishPin: patterns.bullishPin,
      bearishPin: patterns.bearishPin,

      bullishSweep: liquidity.bullish,
      bearishSweep: liquidity.bearish,

      bullishFVG: !!fvg.bullish,
      bearishFVG: !!fvg.bearish,

      bullishBOS: structure.bos === "BULLISH",
      bearishBOS: structure.bos === "BEARISH",

      bullishCHoCH: structure.choch === "BULLISH",
      bearishCHoCH: structure.choch === "BEARISH",

      support: supportResistance.support,
      resistance: supportResistance.resistance,

      bullishOB: orderBlocks.bullish,
      bearishOB: orderBlocks.bearish
    };

    const signals = scoreSignals({
      strategy: state.strategy,
      checks,
      rsi: rsiValues.at(-1),
      current,
      ema20: ema20.at(-1),
      ema50: ema50.at(-1),
      atr
    });

    const direction = chooseDirection(
      state.strategy,
      checks,
      signals
    );

    const conflict =
      signals.bullish >= 35 &&
      signals.bearish >= 35;

    let reason = "";

    if (conflict) {
      reason = "Signal conflict — wait for clearer confirmation.";
    } else if (direction === "BUY") {
      reason = "Bullish conditions detected. Confirm entry and risk.";
    } else if (direction === "SELL") {
      reason = "Bearish conditions detected. Confirm entry and risk.";
    } else {
      reason = "Conditions are incomplete. Wait for confirmation.";
    }

    state.analysis = {
      direction: conflict ? "WAIT" : direction,
      rawDirection: direction,

      conflict,
      reason,

      score: Math.round(
        Math.max(signals.bullish, signals.bearish)
      ),

      bullishScore: signals.bullish,
      bearishScore: signals.bearish,

      checks,
      swings,
      structure,
      patterns,
      fvg,
      liquidity,
      supportResistance,
      orderBlocks,

      ema20,
      ema50,
      ema200,
      atrValues,
      rsiValues,

      current,
      atr,
      rsi: rsiValues.at(-1),

      analyzedAt: Date.now()
    };

    updateAnalysisUI();
    updateChartBadges();

    return state.analysis;
  }

  /* =======================================================
     10. STRATEGY SCORING
     ======================================================= */

  function scoreSignals(data) {
    const { strategy, checks, rsi, current, ema20, ema50, atr } = data;

    let bullish = 0;
    let bearish = 0;

    function add(condition, amount, direction) {
      if (!condition) return;

      if (direction === "BUY") {
        bullish += amount;
      } else {
        bearish += amount;
      }
    }

    /* Trend alignment */

    add(checks.trendBullish, 15, "BUY");
    add(checks.trendBearish, 15, "SELL");

    add(checks.macroBullish, 8, "BUY");
    add(checks.macroBearish, 8, "SELL");

    /* Price-action patterns */

    add(checks.bullishEngulfing, 14, "BUY");
    add(checks.bearishEngulfing, 14, "SELL");

    add(checks.bullishPin, 10, "BUY");
    add(checks.bearishPin, 10, "SELL");

    /* Structure */

    add(checks.bullishBOS, 12, "BUY");
    add(checks.bearishBOS, 12, "SELL");

    add(checks.bullishCHoCH, 12, "BUY");
    add(checks.bearishCHoCH, 12, "SELL");

    /* ICT concepts */

    add(checks.bullishSweep, 15, "BUY");
    add(checks.bearishSweep, 15, "SELL");

    add(checks.bullishFVG, 8, "BUY");
    add(checks.bearishFVG, 8, "SELL");

    /* SMC concepts */

    add(!!checks.bullishOB, 8, "BUY");
    add(!!checks.bearishOB, 8, "SELL");

    /* RSI confirmation */

    add(rsi >= 50 && rsi <= 70, 5, "BUY");
    add(rsi >= 30 && rsi < 50, 5, "SELL");

    /* Momentum */

    add(current.close > ema20 && ema20 > ema50, 5, "BUY");
    add(current.close < ema20 && ema20 < ema50, 5, "SELL");

    const normalized = {
      bullish: Math.round(clamp(bullish, 0, 100)),
      bearish: Math.round(clamp(bearish, 0, 100))
    };

    /*
      Strategy-specific filtering:
      We retain shared indicators but require the selected
      strategy's own defining conditions.
    */

    if (strategy === "Price Action") {
      if (!checks.bullishPA) normalized.bullish = Math.min(
        normalized.bullish,
        45
      );

      if (!checks.bearishPA) normalized.bearish = Math.min(
        normalized.bearish,
        45
      );
    }

    if (strategy === "Price Action + ICT") {
      if (!(checks.bullishPA || checks.bullishICT)) {
        normalized.bullish = Math.min(
          normalized.bullish,
          45
        );
      }

      if (!(checks.bearishPA || checks.bearishICT)) {
        normalized.bearish = Math.min(
          normalized.bearish,
          45
        );
      }
    }

    if (strategy === "ICT") {
      if (!checks.bullishICT) normalized.bullish = Math.min(
        normalized.bullish,
        45
      );

      if (!checks.bearishICT) normalized.bearish = Math.min(
        normalized.bearish,
        45
      );
    }

    if (strategy === "SMC") {
      if (!checks.bullishSMC) normalized.bullish = Math.min(
        normalized.bullish,
        45
      );

      if (!checks.bearishSMC) normalized.bearish = Math.min(
        normalized.bearish,
        45
      );
    }

    if (strategy === "Manual Strategy") {
      normalized.bullish = 0;
      normalized.bearish = 0;
    }

    return normalized;
  }

  function chooseDirection(strategy, checks, scores) {
    if (strategy === "Manual Strategy") {
      return "WAIT";
    }

    const minimum = CONFIG.scoreThreshold;

    const buyAllowed =
      scores.bullish >= minimum &&
      scores.bullish > scores.bearish;

    const sellAllowed =
      scores.bearish >= minimum &&
      scores.bearish > scores.bullish;

    if (strategy === "Price Action" && !(
      checks.bullishPA || checks.bearishPA
    )) {
      return "WAIT";
    }

    if (strategy === "ICT" && !(
      checks.bullishICT || checks.bearishICT
    )) {
      return "WAIT";
    }

    if (strategy === "SMC" && !(
      checks.bullishSMC || checks.bearishSMC
    )) {
      return "WAIT";
    }

    if (
      strategy === "Price Action + ICT" &&
      !(
        checks.bullishPA ||
        checks.bearishPA ||
        checks.bullishICT ||
        checks.bearishICT
      )
    ) {
      return "WAIT";
    }

    if (buyAllowed) return "BUY";
    if (sellAllowed) return "SELL";

    return "WAIT";
  }

  /* =======================================================
     11. ANALYSIS UI
     ======================================================= */

  function updateAnalysisUI() {
    const analysis = state.analysis;

    if (!analysis) return;

    const status = byId("analysisStatus");

    if (status) {
      status.classList.remove(
        "waiting",
        "buy",
        "sell",
        "neutral"
      );

      if (analysis.direction === "BUY") {
        status.classList.add("buy");
      } else if (analysis.direction === "SELL") {
        status.classList.add("sell");
      } else {
        status.classList.add("waiting");
      }
    }

    setText(
      "analysisTitle",
      analysis.direction === "BUY"
        ? "BUY CONDITIONS"
        : analysis.direction === "SELL"
          ? "SELL CONDITIONS"
          : "WAITING FOR CONFIRMATION"
    );

    setText("analysisMessage", analysis.reason);

    setText("analysisScore", analysis.score);
    setText("bullishScore", analysis.bullishScore);
    setText("bearishScore", analysis.bearishScore);

    const scoreFill = byId("scoreFill");

    if (scoreFill) {
      scoreFill.style.width = `${analysis.score}%`;
    }

    renderChecklist(analysis);
    renderAnalysisReport(analysis);

    updateTradePlanFromAnalysis();
  }

  function renderChecklist(analysis) {
    const list =
      byId("checkList") ||
      byId("analysisChecklist") ||
      byId("checklist");

    if (!list) return;

    const checks = analysis.checks;

    const rows = [
      {
        label: "Market structure",
        passed:
          checks.bullishBOS ||
          checks.bearishBOS ||
          checks.bullishCHoCH ||
          checks.bearishCHoCH,
        detail:
          `Trend: ${analysis.structure.trend}; BOS: ${analysis.structure.bos}`
      },
      {
        label: "EMA trend",
        passed:
          checks.trendBullish ||
          checks.trendBearish,
        detail:
          checks.trendBullish
            ? "Bullish short-term trend"
            : checks.trendBearish
              ? "Bearish short-term trend"
              : "Trend is not clearly aligned"
      },
      {
        label: "Candle confirmation",
        passed:
          checks.bullishEngulfing ||
          checks.bearishEngulfing ||
          checks.bullishPin ||
          checks.bearishPin,
        detail: "Engulfing and pin-bar candidates"
      },
      {
        label: "Liquidity sweep",
        passed:
          checks.bullishSweep ||
          checks.bearishSweep,
        detail: "A swing level was swept and reclaimed"
      },
      {
        label: "Fair value gap",
        passed:
          checks.bullishFVG ||
          checks.bearishFVG,
        detail: "Three-candle gap candidate"
      },
      {
        label: "Order block candidate",
        passed:
          !!checks.bullishOB ||
          !!checks.bearishOB,
        detail: "Opposite candle before displacement"
      }
    ];

    list.innerHTML = rows.map((row) => {
      const status = row.passed ? "pass" : "pending";

      return `
        <div class="check-item ${status}">
          <div class="check-icon">
            ${row.passed ? "✓" : "·"}
          </div>

          <div class="check-item-content">
            <strong>${escapeHTML(row.label)}</strong>
            <p>${escapeHTML(row.detail)}</p>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAnalysisReport(analysis) {
    const report =
      byId("reportContent") ||
      byId("analysisReport") ||
      byId("reportGrid");

    if (!report) return;

    const trend = analysis.structure.trend;
    const bos = analysis.structure.bos;
    const choch = analysis.structure.choch;

    const support = analysis.supportResistance.support;
    const resistance = analysis.supportResistance.resistance;

    const fvg =
      analysis.fvg.bullish ||
      analysis.fvg.bearish;

    const ob =
      analysis.orderBlocks.bullish ||
      analysis.orderBlocks.bearish;

    report.innerHTML = `
      <article class="report-card">
        <h4>Market Structure</h4>
        <p>
          Trend: <strong>${escapeHTML(trend)}</strong><br>
          BOS: <strong>${escapeHTML(bos)}</strong><br>
          CHoCH: <strong>${escapeHTML(choch)}</strong>
        </p>
      </article>

      <article class="report-card">
        <h4>Support & Resistance</h4>
        <p>
          Support:
          <strong>
            ${support ? formatPrice(support.price) : "Not identified"}
          </strong><br>

          Resistance:
          <strong>
            ${resistance ? formatPrice(resistance.price) : "Not identified"}
          </strong>
        </p>
      </article>

      <article class="report-card">
        <h4>ICT / SMC Candidates</h4>
        <p>
          Liquidity sweep:
          <strong>
            ${
              analysis.liquidity.bullish
                ? "Bullish"
                : analysis.liquidity.bearish
                  ? "Bearish"
                  : "Not detected"
            }
          </strong><br>

          FVG:
          <strong>
            ${
              fvg
                ? `${formatPrice(fvg.low)} – ${formatPrice(fvg.high)}`
                : "Not detected"
            }
          </strong><br>

          Order block:
          <strong>
            ${
              ob
                ? `${formatPrice(ob.low)} – ${formatPrice(ob.high)}`
                : "Not detected"
            }
          </strong>
        </p>
      </article>

      <article class="report-card warning-card">
        <h4>Risk Reminder</h4>
        <p>
          This is rule-based educational analysis using
          demo candles. It does not predict the future,
          guarantee profitability, or place broker orders.
          Confirm market data and risk before any real trade.
        </p>
      </article>
    `;
  }

  /* =======================================================
     12. TRADE PLAN
     ======================================================= */

  function updateTradePlanFromAnalysis() {
    const analysis = state.analysis;

    if (!analysis) return;

    const entryElement = byId("entryPrice");
    const slElement = byId("stopLoss");
    const tpElement = byId("takeProfit");

    const entry = analysis.current.close;

    if (entryElement && !entryElement.matches(":focus")) {
      if (!entryElement.value) {
        entryElement.value = round(entry, 2);
      }
    }

    /*
      Only propose example SL/TP when the user has not
      entered their own levels. These are draft levels,
      not guaranteed trading recommendations.
    */

    if (
      analysis.direction === "BUY" &&
      analysis.structure.swingLow &&
      slElement &&
      !slElement.value
    ) {
      const sl = analysis.structure.swingLow.price -
        analysis.atr * 0.1;

      slElement.value = round(sl, 2);
    }

    if (
      analysis.direction === "SELL" &&
      analysis.structure.swingHigh &&
      slElement &&
      !slElement.value
    ) {
      const sl = analysis.structure.swingHigh.price +
        analysis.atr * 0.1;

      slElement.value = round(sl, 2);
    }

    if (
      tpElement &&
      !tpElement.value &&
      slElement &&
      slElement.value &&
      entryElement &&
      entryElement.value
    ) {
      const e = Number(entryElement.value);
      const sl = Number(slElement.value);

      if (Number.isFinite(e) && Number.isFinite(sl) && e !== sl) {
        const risk = Math.abs(e - sl);

        const tp = analysis.direction === "SELL"
          ? e - risk * CONFIG.defaultRR
          : e + risk * CONFIG.defaultRR;

        tpElement.value = round(tp, 2);
      }
    }

    calculateTradePlan();
  }

  function calculateTradePlan() {
    const entry = numberFromInput("entryPrice");
    const sl = numberFromInput("stopLoss");
    const tp = numberFromInput("takeProfit");

    const direction = state.tradeDirection;

    const valuesValid =
      Number.isFinite(entry) &&
      Number.isFinite(sl) &&
      Number.isFinite(tp) &&
      entry > 0 &&
      sl > 0 &&
      tp > 0;

    let valid = false;
    let risk = 0;
    let reward = 0;
    let rr = 0;

    if (valuesValid) {
      risk = direction === "BUY"
        ? entry - sl
        : sl - entry;

      reward = direction === "BUY"
        ? tp - entry
        : entry - tp;

      valid = risk > 0 && reward > 0;

      if (valid) {
        rr = reward / risk;
      }
    }

    setText(
      "rrValue",
      valid ? `1 : ${round(rr, 2)}` : "Invalid levels"
    );

    setText(
      "riskValue",
      valid ? formatPrice(risk) : "--"
    );

    setText(
      "rewardValue",
      valid ? formatPrice(reward) : "--"
    );

    const summary = byId("rrSummary");

    if (summary) {
      summary.classList.toggle("positive", valid && rr >= 2);
      summary.classList.toggle("negative", !valid);
    }

    return {
      entry,
      sl,
      tp,
      direction,
      risk,
      reward,
      rr,
      valid
    };
  }

  function validateTradePlan() {
    const plan = calculateTradePlan();

    const messages = [];

    if (!plan.valid) {
      messages.push(
        "Entry, SL and TP are incomplete or incorrectly ordered."
      );
    }

    if (plan.valid && plan.rr < 1) {
      messages.push(
        "Risk/reward is below 1:1. Review the trade plan."
      );
    }

    if (plan.valid && plan.rr < 2) {
      messages.push(
        "Risk/reward is below the default 1:2 target."
      );
    }

    if (plan.valid && plan.rr >= 2) {
      messages.push(
        "Price levels are logically ordered and R:R is at least 1:2."
      );
    }

    if (state.analysis?.direction === "WAIT") {
      messages.push(
        "The selected strategy has not confirmed a directional setup."
      );
    }

    const message = messages.join("\n");

    showToast(
      messages.length
        ? messages[0]
        : "Trade plan checked.",
      plan.valid ? "success" : "error"
    );

    showValidationReport(plan, messages);

    return {
      ...plan,
      messages
    };
  }

  function showValidationReport(plan, messages) {
    const report =
      byId("reportContent") ||
      byId("analysisReport") ||
      byId("reportGrid");

    if (!report) return;

    const currentHTML = report.innerHTML;

    report.innerHTML = `
      <article class="report-card ${plan.valid ? "success" : "error-card"}">
        <h4>Trade Plan Validation</h4>
        <p>
          Entry: ${Number.isFinite(plan.entry) ? formatPrice(plan.entry) : "--"}<br>
          Stop Loss: ${Number.isFinite(plan.sl) ? formatPrice(plan.sl) : "--"}<br>
          Take Profit: ${Number.isFinite(plan.tp) ? formatPrice(plan.tp) : "--"}<br>
          Risk/Reward: ${plan.valid ? `1 : ${round(plan.rr, 2)}` : "Invalid"}
        </p>
        <ul>
          ${
            messages.length
              ? messages.map((message) =>
                  `<li>${escapeHTML(message)}</li>`
                ).join("")
              : "<li>Price ordering is valid.</li>"
          }
        </ul>
      </article>
      ${currentHTML}
    `;
  }

  /* =======================================================
     13. CANVAS INITIALIZATION
     ======================================================= */

  function initializeCanvas() {
    canvas = byId("chartCanvas");

    if (!canvas) {
      console.warn(
        "NAOL SMART TRADING: #chartCanvas was not found."
      );

      return false;
    }

    ctx = canvas.getContext("2d");

    if (!ctx) {
      showToast(
        "This browser cannot create the chart canvas.",
        "error"
      );

      return false;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
      });

      resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", resizeCanvas);
    }

    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerup", onCanvasPointerUp);
    canvas.addEventListener("pointercancel", onCanvasPointerUp);
    canvas.addEventListener("dblclick", onCanvasDoubleClick);

    resizeCanvas();

    return true;
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    chartRect = {
      width: rect.width,
      height: rect.height
    };

    renderChart();
  }

  /* =======================================================
     14. CHART GEOMETRY
     ======================================================= */

  function getVisibleCandles() {
    const candles = state.candles;

    if (!candles.length) return [];

    const baseCount = Math.max(
      12,
      Math.floor(85 / state.zoom)
    );

    const count = Math.min(
      candles.length,
      baseCount
    );

    const end = Math.max(
      count,
      candles.length - state.panOffset
    );

    const start = Math.max(0, end - count);

    return candles.slice(start, end).map((candle, index) => ({
      ...candle,
      originalIndex: start + index
    }));
  }

  function getChartBounds(candles, width, height) {
    const padding = CONFIG.padding;

    let high = -Infinity;
    let low = Infinity;

    candles.forEach((candle) => {
      high = Math.max(high, candle.high);
      low = Math.min(low, candle.low);
    });

    if (!Number.isFinite(high) || !Number.isFinite(low)) {
      high = 1;
      low = 0;
    }

    const range = Math.max(high - low, 0.0000001);
    const extra = range * 0.08;

    high += extra;
    low -= extra;

    return {
      left: padding.left,
      right: width - padding.right,
      top: padding.top,
      bottom: height - padding.bottom,

      high,
      low,

      priceRange: high - low
    };
  }

  function priceToY(price, bounds) {
    const height = bounds.bottom - bounds.top;

    return bounds.bottom -
      ((price - bounds.low) / bounds.priceRange) * height;
  }

  function yToPrice(y, bounds) {
    const height = bounds.bottom - bounds.top;

    return bounds.low +
      ((bounds.bottom - y) / height) * bounds.priceRange;
  }

  function indexToX(index, count, bounds) {
    const width = bounds.right - bounds.left;

    const slot = width / Math.max(count, 1);

    return bounds.left + slot * (index + 0.5);
  }

  function xToVisibleIndex(x, count, bounds) {
    const width = bounds.right - bounds.left;

    const slot = width / Math.max(count, 1);

    return clamp(
      Math.floor((x - bounds.left) / slot),
      0,
      Math.max(0, count - 1)
    );
  }

  /* =======================================================
     15. DRAW CHART
     ======================================================= */

  function renderChart() {
    if (!canvas || !ctx || !chartRect) return;

    const width = chartRect.width;
    const height = chartRect.height;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#080f1b";
    ctx.fillRect(0, 0, width, height);

    const candles = getVisibleCandles();

    if (!candles.length) {
      drawChartMessage(
        "No candle data",
        "Select a symbol to generate demo candles."
      );

      return;
    }

    const bounds = getChartBounds(
      candles,
      width,
      height
    );

    if (state.gridVisible) {
      drawGrid(bounds, width, height);
    }

    drawMovingAverages(candles, bounds);

    drawCandles(candles, bounds);

    drawAnalysisLevels(candles, bounds);

    drawDrawings(candles, bounds);

    if (state.drawingPreview) {
      drawOneDrawing(
        state.drawingPreview,
        candles,
        bounds,
        true
      );
    }

    drawPriceScale(bounds, width);

    drawTimeScale(candles, bounds, height);

    drawCurrentPrice(bounds, width);

    drawChartWatermark(width, height);
  }

  function drawChartMessage(title, message) {
    const width = chartRect.width;
    const height = chartRect.height;

    ctx.textAlign = "center";

    ctx.fillStyle = "#eef4ff";
    ctx.font = "700 16px sans-serif";

    ctx.fillText(
      title,
      width / 2,
      height / 2 - 10
    );

    ctx.fillStyle = "#71819b";
    ctx.font = "12px sans-serif";

    ctx.fillText(
      message,
      width / 2,
      height / 2 + 15
    );

    ctx.textAlign = "left";
  }

  function drawGrid(bounds, width, height) {
    ctx.save();

    ctx.strokeStyle = "rgba(148, 163, 184, 0.09)";
    ctx.lineWidth = 1;

    const horizontalCount = 7;
    const verticalCount = 9;

    for (let i = 0; i <= horizontalCount; i++) {
      const y =
        bounds.top +
        ((bounds.bottom - bounds.top) / horizontalCount) * i;

      ctx.beginPath();
      ctx.moveTo(bounds.left, y);
      ctx.lineTo(width - 1, y);
      ctx.stroke();
    }

    for (let i = 0; i <= verticalCount; i++) {
      const x =
        bounds.left +
        ((bounds.right - bounds.left) / verticalCount) * i;

      ctx.beginPath();
      ctx.moveTo(x, bounds.top);
      ctx.lineTo(x, bounds.bottom);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawCandles(candles, bounds) {
    const plotWidth = bounds.right - bounds.left;
    const slot = plotWidth / candles.length;

    const bodyWidth = clamp(slot * 0.62, 1, 12);

    candles.forEach((candle, index) => {
      const x = indexToX(
        index,
        candles.length,
        bounds
      );

      const yHigh = priceToY(candle.high, bounds);
      const yLow = priceToY(candle.low, bounds);

      const yOpen = priceToY(candle.open, bounds);
      const yClose = priceToY(candle.close, bounds);

      const bullish = candle.close >= candle.open;

      const color = bullish ? "#20e3a2" : "#ff5876";

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      const top = Math.min(yOpen, yClose);
      const bottom = Math.max(yOpen, yClose);

      const bodyHeight = Math.max(1, bottom - top);

      ctx.fillRect(
        x - bodyWidth / 2,
        top,
        bodyWidth,
        bodyHeight
      );

      if (bodyHeight <= 1.5) {
        ctx.beginPath();
        ctx.moveTo(x - bodyWidth / 2, top);
        ctx.lineTo(x + bodyWidth / 2, top);
        ctx.stroke();
      }
    });
  }

  function drawLineSeries(values, candles, bounds, color) {
    if (!values.length || !candles.length) return;

    ctx.save();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.15;
    ctx.globalAlpha = 0.85;

    ctx.beginPath();

    candles.forEach((candle, index) => {
      const value = values[candle.originalIndex];

      if (!Number.isFinite(value)) return;

      const x = indexToX(
        index,
        candles.length,
        bounds
      );

      const y = priceToY(value, bounds);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    ctx.restore();
  }

  function drawMovingAverages(candles, bounds) {
    if (!state.analysis) return;

    drawLineSeries(
      state.analysis.ema20,
      candles,
      bounds,
      "#55a7ff"
    );

    drawLineSeries(
      state.analysis.ema50,
      candles,
      bounds,
      "#a78bfa"
    );
  }

  function drawAnalysisLevels(candles, bounds) {
    if (!state.analysis) return;

    const support =
      state.analysis.supportResistance.support;

    const resistance =
      state.analysis.supportResistance.resistance;

    if (support) {
      drawHorizontalPriceLine(
        support.price,
        bounds,
        "#20e3a2",
        "SUPPORT"
      );
    }

    if (resistance) {
      drawHorizontalPriceLine(
        resistance.price,
        bounds,
        "#ff5876",
        "RESISTANCE"
      );
    }

    const analysis = state.analysis;

    if (analysis.fvg.bullish) {
      drawPriceZone(
        analysis.fvg.bullish,
        bounds,
        "rgba(32, 227, 162, 0.08)",
        "BULLISH FVG"
      );
    }

    if (analysis.fvg.bearish) {
      drawPriceZone(
        analysis.fvg.bearish,
        bounds,
        "rgba(255, 88, 118, 0.08)",
        "BEARISH FVG"
      );
    }
  }

  function drawHorizontalPriceLine(price, bounds, color, label) {
    const y = priceToY(price, bounds);

    ctx.save();

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([5, 4]);

    ctx.beginPath();
    ctx.moveTo(bounds.left, y);
    ctx.lineTo(bounds.right, y);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = "9px sans-serif";

    ctx.fillText(label, bounds.left + 5, y - 5);

    ctx.restore();
  }

  function drawPriceZone(zone, bounds, color, label) {
    const top = priceToY(zone.high, bounds);
    const bottom = priceToY(zone.low, bounds);

    ctx.save();

    ctx.fillStyle = color;

    ctx.fillRect(
      bounds.left,
      Math.min(top, bottom),
      bounds.right - bounds.left,
      Math.max(2, Math.abs(bottom - top))
    );

    ctx.fillStyle = "#a5b4cc";
    ctx.font = "9px sans-serif";

    ctx.fillText(
      label,
      bounds.left + 6,
      Math.min(top, bottom) + 12
    );

    ctx.restore();
  }

  function drawPriceScale(bounds, width) {
    ctx.save();

    ctx.fillStyle = "#0b1423";

    ctx.fillRect(
      bounds.right,
      0,
      width - bounds.right,
      chartRect.height
    );

    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";

    ctx.beginPath();
    ctx.moveTo(bounds.right, bounds.top);
    ctx.lineTo(bounds.right, bounds.bottom);
    ctx.stroke();

    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#8b9bb4";

    const steps = 7;

    for (let i = 0; i <= steps; i++) {
      const price =
        bounds.high -
        (bounds.priceRange / steps) * i;

      const y =
        bounds.top +
        ((bounds.bottom - bounds.top) / steps) * i;

      ctx.fillText(
        formatPrice(price),
        bounds.right + 5,
        y + 3
      );
    }

    ctx.restore();
  }

  function drawTimeScale(candles, bounds, height) {
    ctx.save();

    ctx.fillStyle = "#0b1423";

    ctx.fillRect(
      0,
      bounds.bottom,
      bounds.right,
      height - bounds.bottom
    );

    ctx.font = "9px sans-serif";
    ctx.fillStyle = "#71819b";
    ctx.textAlign = "center";

    const indexes = [
      0,
      Math.floor(candles.length / 3),
      Math.floor(candles.length * 2 / 3),
      candles.length - 1
    ];

    indexes.forEach((index) => {
      const candle = candles[index];

      if (!candle) return;

      const x = indexToX(
        index,
        candles.length,
        bounds
      );

      const date = new Date(candle.time);

      const label =
        state.timeframe === "D1"
          ? date.toLocaleDateString()
          : date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            });

      ctx.fillText(
        label,
        x,
        height - 10
      );
    });

    ctx.restore();
  }

  function drawCurrentPrice(bounds, width) {
    const price = state.candles.at(-1)?.close;

    if (!Number.isFinite(price)) return;

    const y = priceToY(price, bounds);

    ctx.save();

    ctx.strokeStyle = "#55a7ff";
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    ctx.moveTo(bounds.left, y);
    ctx.lineTo(bounds.right, y);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.fillStyle = "#2563eb";

    ctx.fillRect(
      bounds.right,
      y - 10,
      width - bounds.right,
      20
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "left";

    ctx.fillText(
      formatPrice(price),
      bounds.right + 5,
      y + 3
    );

    ctx.restore();
  }

  function drawChartWatermark(width, height) {
    ctx.save();

    ctx.fillStyle = "rgba(165, 180, 204, 0.045)";
    ctx.font = "900 24px sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(
      "NAOL SMART TRADING",
      width / 2,
      height / 2
    );

    ctx.restore();
  }

  /* =======================================================
     16. DRAWING SYSTEM
     ======================================================= */

  function saveUndoSnapshot() {
    state.undoStack.push(
      JSON.stringify(state.drawings)
    );

    if (state.undoStack.length > 60) {
      state.undoStack.shift();
    }
  }

  function makePoint(event) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function getChartMapping() {
    const candles = getVisibleCandles();

    const bounds = getChartBounds(
      candles,
      chartRect.width,
      chartRect.height
    );

    return { candles, bounds };
  }

  function pointToChart(point) {
    const { candles, bounds } = getChartMapping();

    const visibleIndex = xToVisibleIndex(
      point.x,
      candles.length,
      bounds
    );

    const candle = candles[visibleIndex];

    return {
      x: point.x,
      y: point.y,

      price: yToPrice(point.y, bounds),

      index: candle?.originalIndex ?? 0,

      time: candle?.time ?? Date.now()
    };
  }

  function onCanvasPointerDown(event) {
    if (!canvas || !chartRect) return;

    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const point = makePoint(event);

    state.mouse.down = true;
    state.mouse.dragging = false;
    state.mouse.lastX = point.x;
    state.mouse.lastY = point.y;

    const chartPoint = pointToChart(point);

    if (state.activeTool === "select") {
      state.selectedDrawing = findDrawingAt(point);

      if (state.selectedDrawing !== null) {
        state.mouse.dragging = true;
      }

      return;
    }

    if (state.activeTool === "erase") {
      eraseDrawingAt(point);

      return;
    }

    if (state.activeTool === "text") {
      openTextDialog(chartPoint);

      return;
    }

    if (
      [
        "trend",
        "rectangle",
        "arrow",
        "fib",
        "buy",
        "sell"
      ].includes(state.activeTool)
    ) {
      state.drawingStart = chartPoint;

      state.drawingPreview = {
        type: state.activeTool,
        start: chartPoint,
        end: chartPoint
      };

      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (_) {
          // Pointer capture may not be available.
        }
      }

      renderChart();

      return;
    }

    if (state.activeTool === "horizontal") {
      saveUndoSnapshot();

      state.drawings.push({
        id: cryptoRandomId(),
        type: "horizontal",
        start: chartPoint,
        end: chartPoint,
        price: chartPoint.price
      });

      renderChart();
      debounceSave();
    }
  }

  function onCanvasPointerMove(event) {
    if (!canvas || !chartRect) return;

    const point = makePoint(event);

    state.mouse.x = point.x;
    state.mouse.y = point.y;

    if (!state.mouse.down) return;

    if (state.drawingStart && state.drawingPreview) {
      const chartPoint = pointToChart(point);

      state.drawingPreview.end = chartPoint;

      state.mouse.dragging = true;

      renderChart();

      return;
    }

    if (
      state.activeTool === "select" &&
      state.selectedDrawing !== null &&
      state.mouse.dragging
    ) {
      // Drawings are selected here. Full geometric moving is
      // intentionally not implemented in this basic editor.
      return;
    }
  }

  function onCanvasPointerUp(event) {
    if (!canvas || !chartRect) return;

    const point = makePoint(event);

    if (state.drawingStart && state.drawingPreview) {
      const chartPoint = pointToChart(point);

      state.drawingPreview.end = chartPoint;

      saveUndoSnapshot();

      state.drawings.push({
        id: cryptoRandomId(),
        ...state.drawingPreview
      });

      state.drawingPreview = null;
      state.drawingStart = null;

      renderChart();
      debounceSave();

      showToast("Drawing added to chart.");

      setActiveTool("select");
    }

    state.mouse.down = false;
    state.mouse.dragging = false;

    if (
      canvas.releasePointerCapture &&
      event.pointerId !== undefined
    ) {
      try {
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      } catch (_) {
        // Safe to ignore unsupported pointer capture.
      }
    }
  }

  function onCanvasDoubleClick() {
    state.zoom = clamp(state.zoom * 1.15, 0.5, 4);

    renderChart();
  }

  function drawDrawings(candles, bounds) {
    state.drawings.forEach((drawing) => {
      drawOneDrawing(drawing, candles, bounds, false);
    });
  }

  function drawOneDrawing(drawing, candles, bounds, preview) {
    if (!drawing || !drawing.start) return;

    const start = drawing.start;
    const end = drawing.end || drawing.start;

    const x1 = pointToVisibleX(start, candles, bounds);
    const y1 = priceToY(start.price, bounds);

    const x2 = pointToVisibleX(end, candles, bounds);
    const y2 = priceToY(end.price, bounds);

    ctx.save();

    ctx.lineWidth = preview ? 1.8 : 1.6;

    if (preview) {
      ctx.setLineDash([5, 4]);
    }

    if (drawing.type === "horizontal") {
      const y = priceToY(
        drawing.price ?? start.price,
        bounds
      );

      ctx.strokeStyle = "#facc68";

      ctx.beginPath();
      ctx.moveTo(bounds.left, y);
      ctx.lineTo(bounds.right, y);
      ctx.stroke();
    }

    if (drawing.type === "trend") {
      ctx.strokeStyle = "#55a7ff";

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (drawing.type === "arrow") {
      drawArrow(x1, y1, x2, y2, "#facc68");
    }

    if (drawing.type === "rectangle") {
      ctx.strokeStyle = "#a78bfa";
      ctx.fillStyle = "rgba(167, 139, 250, 0.08)";

      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);

      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);

      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }

    if (drawing.type === "fib") {
      drawFibonacci(x1, y1, x2, y2, bounds);
    }

    if (drawing.type === "text") {
      ctx.fillStyle = "#facc68";
      ctx.font = "bold 12px sans-serif";

      ctx.fillText(
        drawing.text || "Note",
        x1,
        y1
      );
    }

    if (drawing.type === "buy") {
      drawTradeMarker(
        x1,
        y1,
        "BUY",
        "#20e3a2"
      );
    }

    if (drawing.type === "sell") {
      drawTradeMarker(
        x1,
        y1,
        "SELL",
        "#ff5876"
      );
    }

    ctx.restore();
  }

  function pointToVisibleX(point, candles, bounds) {
    let closestIndex = 0;
    let closestDistance = Infinity;

    candles.forEach((candle, index) => {
      const distance = Math.abs(
        candle.originalIndex - point.index
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return indexToX(
      closestIndex,
      candles.length,
      bounds
    );
  }

  function drawArrow(x1, y1, x2, y2, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = 9;

    ctx.beginPath();

    ctx.moveTo(x2, y2);

    ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6),
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );

    ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6),
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );

    ctx.closePath();
    ctx.fill();
  }

  function drawFibonacci(x1, y1, x2, y2, bounds) {
    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

    ctx.save();

    ctx.strokeStyle = "rgba(250, 204, 104, 0.7)";
    ctx.fillStyle = "#facc68";

    ctx.font = "9px sans-serif";

    ratios.forEach((ratio) => {
      const y = y1 + (y2 - y1) * ratio;

      ctx.beginPath();
      ctx.moveTo(
        Math.min(x1, x2),
        y
      );

      ctx.lineTo(
        Math.max(x1, x2),
        y
      );

      ctx.stroke();

      ctx.fillText(
        `${(ratio * 100).toFixed(1)}%`,
        Math.max(x1, x2) + 4,
        y - 3
      );
    });

    ctx.restore();
  }

  function drawTradeMarker(x, y, label, color) {
    ctx.save();

    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    const above = label === "SELL";

    ctx.beginPath();

    if (above) {
      ctx.moveTo(x, y);
      ctx.lineTo(x - 7, y + 12);
      ctx.lineTo(x + 7, y + 12);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x - 7, y - 12);
      ctx.lineTo(x + 7, y - 12);
    }

    ctx.closePath();
    ctx.fill();

    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(
      label,
      x,
      above ? y - 6 : y + 23
    );

    ctx.restore();
  }

  function findDrawingAt(point) {
    const { candles, bounds } = getChartMapping();

    for (let i = state.drawings.length - 1; i >= 0; i--) {
      const drawing = state.drawings[i];

      if (!drawing.start) continue;

      const x1 = pointToVisibleX(
        drawing.start,
        candles,
        bounds
      );

      const y1 = priceToY(
        drawing.start.price,
        bounds
      );

      if (
        Math.abs(point.x - x1) < 12 &&
        Math.abs(point.y - y1) < 12
      ) {
        return i;
      }

      if (drawing.type === "horizontal") {
        const y = priceToY(
          drawing.price ?? drawing.start.price,
          bounds
        );

        if (Math.abs(point.y - y) < 8) {
          return i;
        }
      }
    }

    return null;
  }

  function eraseDrawingAt(point) {
    const index = findDrawingAt(point);

    if (index === null) {
      showToast("No drawing found at this location.", "warning");
      return;
    }

    saveUndoSnapshot();

    state.drawings.splice(index, 1);

    renderChart();
    debounceSave();

    showToast("Drawing erased.");
  }

  function openTextDialog(point) {
    const dialog = byId("textDialog");

    if (!dialog) {
      const text = prompt("Enter chart note:");

      if (text) {
        saveUndoSnapshot();

        state.drawings.push({
          id: cryptoRandomId(),
          type: "text",
          start: point,
          end: point,
          text
        });

        renderChart();
        debounceSave();
      }

      return;
    }

    state.pendingTextPoint = point;

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      const text = prompt("Enter chart note:");

      if (text) {
        saveUndoSnapshot();

        state.drawings.push({
          id: cryptoRandomId(),
          type: "text",
          start: point,
          end: point,
          text
        });

        renderChart();
        debounceSave();
      }
    }
  }

  function cryptoRandomId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return `drawing-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  /* =======================================================
     17. TOOL SELECTION AND UNDO
     ======================================================= */

  function setActiveTool(tool) {
    state.activeTool = tool;

    const buttons = $$("[data-tool]");

    buttons.forEach((button) => {
      const active = button.dataset.tool === tool;

      button.classList.toggle("active", active);

      button.setAttribute(
        "aria-pressed",
        String(active)
      );
    });

    if (canvas) {
      canvas.style.cursor =
        tool === "select"
          ? "default"
          : tool === "erase"
            ? "not-allowed"
            : "crosshair";
    }
  }

  function undoDrawing() {
    if (!state.undoStack.length) {
      showToast("Nothing to undo.", "warning");
      return;
    }

    try {
      state.drawings = JSON.parse(
        state.undoStack.pop()
      );

      renderChart();
      debounceSave();

      showToast("Last drawing action undone.");
    } catch (error) {
      console.error(error);

      showToast(
        "Undo could not restore the drawing state.",
        "error"
      );
    }
  }

  function clearDrawings() {
    if (!state.drawings.length) {
      showToast("There are no drawings to clear.", "warning");
      return;
    }

    const confirmed = confirm(
      "Clear all drawings from the chart?"
    );

    if (!confirmed) return;

    saveUndoSnapshot();

    state.drawings = [];

    renderChart();
    debounceSave();

    showToast("All drawings cleared.");
  }

  /* =======================================================
     18. SYMBOL AND TIMEFRAME CONTROLS
     ======================================================= */

  function changeSymbol(symbol) {
    if (!symbol) return;

    state.symbol = symbol;

    regenerateCandles();

    showToast(
      `${symbol} selected. Demo candles loaded.`,
      "success"
    );
  }

  function changeTimeframe(timeframe) {
    if (!timeframe) return;

    state.timeframe = timeframe;

    regenerateCandles();

    updateTimeframeButtons();

    showToast(
      `${timeframe} timeframe selected.`,
      "success"
    );
  }

  function updateTimeframeButtons() {
    $$("[data-timeframe]").forEach((button) => {
      const active =
        button.dataset.timeframe === state.timeframe;

      button.classList.toggle("active", active);

      button.setAttribute(
        "aria-pressed",
        String(active)
      );
    });
  }

  function updatePriceDisplay() {
    const price = state.candles.at(-1)?.close;

    if (!Number.isFinite(price)) return;

    state.lastPrice = price;

    setText("currentPrice", formatPrice(price));
    setText("chartPrice", formatPrice(price));
    setText("symbolPrice", formatPrice(price));

    setText("symbolName", state.symbol);

    const symbolSelect = byId("symbolSelect");

    if (
      symbolSelect &&
      symbolSelect.value !== state.symbol
    ) {
      symbolSelect.value = state.symbol;
    }
  }

  function updateChartBadges() {
    setText("chartSymbol", state.symbol);
    setText("chartTimeframe", state.timeframe);

    setText(
      "chartMode",
      state.strategy || "Choose strategy"
    );

    const demoBadge = byId("demoBadge");

    if (demoBadge) {
      demoBadge.textContent = "DEMO DATA";
    }
  }

  /* =======================================================
     19. STRATEGY SELECTION
     ======================================================= */

  function chooseStrategy(strategy) {
    const supported = [
      "Naol Smart Strategy",
      "Price Action + ICT",
      "Price Action",
      "ICT",
      "SMC",
      "Manual Strategy"
    ];

    if (!supported.includes(strategy)) {
      showToast("Unknown strategy selected.", "error");
      return;
    }

    state.strategy = strategy;

    $$("[data-strategy]").forEach((button) => {
      const active =
        button.dataset.strategy === strategy;

      button.classList.toggle("active", active);
      button.classList.toggle("selected", active);

      button.setAttribute(
        "aria-pressed",
        String(active)
      );
    });

    const workspace =
      byId("workspace") ||
      byId("tradingWorkspace");

    setHidden(workspace, false);

    setText("selectedStrategy", strategy);
    setText("strategyName", strategy);

    analyzeMarket();
    renderChart();
    updateChartBadges();

    debounceSave();

    if (workspace) {
      workspace.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    showToast(`${strategy} selected.`);
  }

  /* =======================================================
     20. NOTES
     ======================================================= */

  function setupNotes() {
    const notes =
      byId("notesArea") ||
      byId("notes");

    if (!notes) return;

    notes.value = state.notes;

    notes.addEventListener("input", () => {
      state.notes = notes.value;
      debounceSave();
    });
  }

  /* =======================================================
     21. LOCAL STORAGE
     ======================================================= */

  function saveState() {
    const entry = getElementValue("entryPrice");
    const sl = getElementValue("stopLoss");
    const tp = getElementValue("takeProfit");

    const notes =
      byId("notesArea") ||
      byId("notes");

    const snapshot = {
      version: 1,

      strategy: state.strategy,
      symbol: state.symbol,
      timeframe: state.timeframe,
      mode: state.mode,

      drawings: state.drawings,

      zoom: state.zoom,
      gridVisible: state.gridVisible,

      tradeDirection: state.tradeDirection,

      entry,
      sl,
      tp,

      notes: notes ? notes.value : state.notes,

      savedAt: new Date().toISOString()
    };

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(snapshot)
      );
    } catch (error) {
      console.warn("Could not save state:", error);
    }
  }

  function loadState() {
    let saved;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return false;

      saved = JSON.parse(raw);
    } catch (error) {
      console.warn("Could not load saved state:", error);

      return false;
    }

    if (!saved || typeof saved !== "object") {
      return false;
    }

    const allowedStrategies = [
      "Naol Smart Strategy",
      "Price Action + ICT",
      "Price Action",
      "ICT",
      "SMC",
      "Manual Strategy"
    ];

    if (allowedStrategies.includes(saved.strategy)) {
      state.strategy = saved.strategy;
    }

    if (typeof saved.symbol === "string") {
      state.symbol = saved.symbol;
    }

    if (typeof saved.timeframe === "string") {
      state.timeframe = saved.timeframe;
    }

    if (Array.isArray(saved.drawings)) {
      state.drawings = saved.drawings;
    }

    if (Number.isFinite(saved.zoom)) {
      state.zoom = clamp(saved.zoom, 0.5, 4);
    }

    if (typeof saved.gridVisible === "boolean") {
      state.gridVisible = saved.gridVisible;
    }

    if (
      saved.tradeDirection === "BUY" ||
      saved.tradeDirection === "SELL"
    ) {
      state.tradeDirection = saved.tradeDirection;
    }

    state.notes = String(saved.notes || "");

    return saved;
  }

  /* =======================================================
     22. EXPORT / IMPORT
     ======================================================= */

  function downloadJSON(data, filename) {
    const blob = new Blob(
      [JSON.stringify(data, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function exportBackup() {
    saveState();

    let saved = {};

    try {
      saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "{}"
      );
    } catch (_) {
      saved = {};
    }

    downloadJSON(
      saved,
      `naol-smart-trading-${Date.now()}.json`
    );

    showToast("Backup exported.");
  }

  function importBackupFile(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        if (!data || typeof data !== "object") {
          throw new Error("Invalid backup file.");
        }

        const confirmed = confirm(
          "Import this backup? Your current saved workspace may be replaced."
        );

        if (!confirmed) return;

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(data)
        );

        location.reload();
      } catch (error) {
        console.error(error);

        showToast(
          "Could not import this JSON backup.",
          "error"
        );
      }
    };

    reader.onerror = () => {
      showToast("Could not read the selected file.", "error");
    };

    reader.readAsText(file);
  }

  /* =======================================================
     23. CHART ZOOM
     ======================================================= */

  function zoomIn() {
    state.zoom = clamp(state.zoom * 1.18, 0.5, 4);

    renderChart();
    debounceSave();
  }

  function zoomOut() {
    state.zoom = clamp(state.zoom / 1.18, 0.5, 4);

    renderChart();
    debounceSave();
  }

  function resetZoom() {
    state.zoom = 1;
    state.panOffset = 0;

    renderChart();
    debounceSave();
  }

  /* =======================================================
     24. BUTTON AND INPUT BINDINGS
     ======================================================= */

  function bindClick(selector, handler) {
    $$(selector).forEach((element) => {
      element.addEventListener("click", (event) => {
        event.preventDefault();

        handler(element, event);
      });
    });
  }

  function bindUI() {
    /* Strategy cards */

    bindClick("[data-strategy]", (element) => {
      chooseStrategy(element.dataset.strategy);
    });

    /* Drawing toolbar */

    bindClick("[data-tool]", (element) => {
      const tool = element.dataset.tool;

      if (!tool) return;

      if (tool === "undo") {
        undoDrawing();
        return;
      }

      if (tool === "erase-all" || tool === "clear") {
        clearDrawings();
        return;
      }

      if (tool === "grid") {
        state.gridVisible = !state.gridVisible;

        element.classList.toggle(
          "active",
          state.gridVisible
        );

        renderChart();
        debounceSave();

        return;
      }

      setActiveTool(tool);
    });

    /* Symbol */

    const symbolSelect = byId("symbolSelect");

    if (symbolSelect) {
      symbolSelect.addEventListener("change", () => {
        changeSymbol(symbolSelect.value);
      });
    }

    /* Timeframe select */

    const timeframeSelect = byId("timeframeSelect");

    if (timeframeSelect) {
      timeframeSelect.addEventListener("change", () => {
        changeTimeframe(timeframeSelect.value);
      });
    }

    bindClick("[data-timeframe]", (element) => {
      changeTimeframe(element.dataset.timeframe);
    });

    /* Analysis button */

    bindClick(
      "#analyzeButton, #runAnalysis, [data-action='analyze']",
      () => {
        if (!state.strategy) {
          showToast(
            "Select a strategy before running analysis.",
            "warning"
          );

          return;
        }

        analyzeMarket();
        renderChart();

        showToast("Analysis completed.");
      }
    );

    /* Trade plan */

    bindClick(
      "#validateTradeButton, #checkTradePlan, [data-action='validate-trade']",
      validateTradePlan
    );

    bindClick(
      "#drawTradePlan, [data-action='draw-trade-plan']",
      () => {
        const plan = calculateTradePlan();

        if (!plan.valid) {
          showToast(
            "Enter valid Entry, SL and TP first.",
            "error"
          );

          return;
        }

        saveUndoSnapshot();

        const start = {
          price: plan.entry,
          index: state.candles.length - 1,
          time: Date.now()
        };

        state.drawings.push({
          id: cryptoRandomId(),
          type: plan.direction === "BUY" ? "buy" : "sell",
          start,
          end: start
        });

        state.drawings.push({
          id: cryptoRandomId(),
          type: "horizontal",
          start: {
            price: plan.sl,
            index: state.candles.length - 1,
            time: Date.now()
          },
          end: {
            price: plan.sl,
            index: state.candles.length - 1,
            time: Date.now()
          },
          price: plan.sl
        });

        state.drawings.push({
          id: cryptoRandomId(),
          type: "horizontal",
          start: {
            price: plan.tp,
            index: state.candles.length - 1,
            time: Date.now()
          },
          end: {
            price: plan.tp,
            index: state.candles.length - 1,
            time: Date.now()
          },
          price: plan.tp
        });

        renderChart();
        debounceSave();

        showToast("Trade plan levels drawn.");
      }
    );

    /* Direction buttons */

    bindClick("[data-direction]", (element) => {
      const direction = element.dataset.direction;

      if (direction !== "BUY" && direction !== "SELL") {
        return;
      }

      state.tradeDirection = direction;

      $$("[data-direction]").forEach((button) => {
        const active =
          button.dataset.direction === direction;

        button.classList.toggle("active", active);

        button.setAttribute(
          "aria-pressed",
          String(active)
        );
      });

      calculateTradePlan();
      debounceSave();
    });

    /* Input validation */

    [
      "entryPrice",
      "stopLoss",
      "takeProfit"
    ].forEach((id) => {
      const element = byId(id);

      if (!element) return;

      element.addEventListener("input", () => {
        calculateTradePlan();
        debounceSave();
      });
    });

    /* Notes */

    setupNotes();

    /* Export */

    bindClick(
      "#exportButton, #exportBackup, [data-action='export']",
      exportBackup
    );

    /* Import */

    bindClick(
      "#importButton, #importBackup, [data-action='import']",
      () => {
        const input =
          byId("importFile") ||
          byId("importInput");

        if (input) {
          input.click();
          return;
        }

        const newInput = document.createElement("input");

        newInput.type = "file";
        newInput.accept = "application/json,.json";

        newInput.addEventListener("change", () => {
          importBackupFile(newInput.files?.[0]);
        });

        newInput.click();
      }
    );

    [
      "importFile",
      "importInput"
    ].forEach((id) => {
      const input = byId(id);

      if (!input) return;

      input.addEventListener("change", () => {
        importBackupFile(input.files?.[0]);

        input.value = "";
      });
    });

    /* Zoom */

    bindClick(
      "#zoomIn, [data-action='zoom-in']",
      zoomIn
    );

    bindClick(
      "#zoomOut, [data-action='zoom-out']",
      zoomOut
    );

    bindClick(
      "#resetZoom, [data-action='reset-zoom']",
      resetZoom
    );

    /* Clear drawings */

    bindClick(
      "#clearDrawings, [data-action='clear-drawings']",
      clearDrawings
    );

    /* Manual refresh */

    bindClick(
      "#refreshChart, [data-action='refresh-chart']",
      () => {
        regenerateCandles();

        showToast("Demo chart refreshed.");
      }
    );

    /* Text dialog buttons */

    const dialog = byId("textDialog");

    const textInput =
      byId("drawingText") ||
      byId("textInput");

    bindClick(
      "#saveTextButton, #addTextButton, [data-action='save-text']",
      () => {
        if (!state.pendingTextPoint) return;

        const text = textInput
          ? textInput.value.trim()
          : "";

        if (!text) {
          showToast("Enter text before saving.", "warning");
          return;
        }

        saveUndoSnapshot();

        state.drawings.push({
          id: cryptoRandomId(),
          type: "text",
          start: state.pendingTextPoint,
          end: state.pendingTextPoint,
          text
        });

        state.pendingTextPoint = null;

        if (textInput) textInput.value = "";

        if (dialog?.open) dialog.close();

        renderChart();
        debounceSave();

        showToast("Chart text added.");
      }
    );

    bindClick(
      "#cancelTextButton, [data-action='cancel-text']",
      () => {
        state.pendingTextPoint = null;

        if (dialog?.open) dialog.close();
      }
    );

    /* Save state before leaving */

    window.addEventListener("beforeunload", saveState);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        saveState();
      }
    });
  }

  /* =======================================================
     25. INITIALIZE APPLICATION
     ======================================================= */

  function initializeApp() {
    if (state.initialized) return;

    state.initialized = true;

    const saved = loadState();

    if (saved && saved.strategy) {
      const workspace =
        byId("workspace") ||
        byId("tradingWorkspace");

      setHidden(workspace, false);
    }

    if (!state.strategy) {
      const workspace =
        byId("workspace") ||
        byId("tradingWorkspace");

      setHidden(workspace, true);
    }

    bindUI();

    if (!initializeCanvas()) {
      console.error(
        "Chart initialization failed. Check index.html for id='chartCanvas'."
      );
    }

    state.candles = createDemoCandles();

    state.lastPrice =
      state.candles.at(-1)?.close ?? null;

    if (state.strategy) {
      $$("[data-strategy]").forEach((button) => {
        const active =
          button.dataset.strategy === state.strategy;

        button.classList.toggle("active", active);
        button.classList.toggle("selected", active);

        button.setAttribute(
          "aria-pressed",
          String(active)
        );
      });
    }

    const entryElement = byId("entryPrice");
    const slElement = byId("stopLoss");
    const tpElement = byId("takeProfit");

    if (saved && entryElement) {
      entryElement.value = saved.entry || "";
    }

    if (saved && slElement) {
      slElement.value = saved.sl || "";
    }

    if (saved && tpElement) {
      tpElement.value = saved.tp || "";
    }

    const notes =
      byId("notesArea") ||
      byId("notes");

    if (notes) {
      notes.value = state.notes;
    }

    updateTimeframeButtons();

    updatePriceDisplay();
    updateChartBadges();

    analyzeMarket();
    renderChart();

    calculateTradePlan();

    const gridButton = $("[data-tool='grid']");

    if (gridButton) {
      gridButton.classList.toggle(
        "active",
        state.gridVisible
      );
    }

    setActiveTool("select");

    console.info(
      "NAOL SMART TRADING initialized."
    );
  }

  /* =======================================================
     26. STARTUP
     ======================================================= */

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeApp,
      { once: true }
    );
  } else {
    initializeApp();
  }

})();
