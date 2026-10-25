from typing import Any

import yfinance as yf

from .base import Cube


class AlphaCube(Cube):
    @property
    def name(self) -> str:
        return "Alpha Cube"

    @property
    def description(self) -> str:
        return "Real-time Autonomous Financial Analyst."

    def run(self, input_data: Any) -> dict[str, Any]:
        """
        Input: Dictionary with 'text' (Ticker symbol, e.g. "AAPL")
        """
        ticker_symbol = input_data.get("text", "").upper().strip()
        if not ticker_symbol:
            return {"status": "error", "message": "No ticker symbol provided."}

        try:
            stock = yf.Ticker(ticker_symbol)
            info = stock.info

            # Extract key metrics
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            pe_ratio = info.get("trailingPE")
            forward_pe = info.get("forwardPE")
            market_cap = info.get("marketCap")
            sector = info.get("sector", "Unknown")
            summary = info.get("longBusinessSummary", "")

            # Simple "Analysis" Logic (Mocking the LLM reasoning for speed)
            rating = "HOLD"
            thesis = ""

            if pe_ratio and pe_ratio > 50:
                rating = "SELL"
                thesis = f"{ticker_symbol} is trading at a very high P/E of {pe_ratio:.2f}, suggesting it is overvalued relative to earnings. Caution is advised unless growth is explosive."
            elif pe_ratio and pe_ratio < 15:
                rating = "BUY"
                thesis = f"{ticker_symbol} appears undervalued with a P/E of {pe_ratio:.2f}. It may be a value play in the {sector} sector."
            else:
                rating = "HOLD"
                thesis = f"{ticker_symbol} is fairly valued. Monitor upcoming earnings reports for the {sector} sector."

            return {
                "status": "success",
                "ticker": ticker_symbol,
                "price": price,
                "pe_ratio": pe_ratio,
                "forward_pe": forward_pe,
                "market_cap": market_cap,
                "sector": sector,
                "rating": rating,
                "thesis": thesis,
                "description": summary[:200] + "...",
            }

        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to fetch data for {ticker_symbol}: {e!s}",
            }
