"use client";

import { useState } from "react";
import { Search, Scan, ArrowRight, Loader2 } from "lucide-react";
import Scanner from "./components/Scanner";
import Results from "./components/Results";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export default function Home() {
    const [barcode, setBarcode] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState(""); // New state for status messages

    const handleScanSuccess = (decodedText: string) => {
        setBarcode(decodedText);
        setIsScanning(false);
    };

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setError(null);
        setResults(null);
        setStatusMessage("Initializing...");

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to analyze product');
            }

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const message = JSON.parse(line);

                        if (message.type === 'status') {
                            setStatusMessage(message.message);
                        } else if (message.type === 'result') {
                            setResults(message.data);
                        } else if (message.type === 'error') {
                            throw new Error(message.message);
                        }
                    } catch (e) {
                        console.error("Error parsing stream:", e);
                    }
                }
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsAnalyzing(false);
            setStatusMessage("");
        }
    };

    if (results) {
        return (
            <main className="min-h-screen bg-zinc-50 p-4 dark:bg-zinc-950 transition-colors duration-300">
                <Results data={results} onReset={() => setResults(null)} />
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-300">
            <div className="container mx-auto px-4 py-16 md:py-24">
                {/* Header */}
                <div className="mx-auto max-w-2xl text-center">
                    <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                        Ingredient Truth
                    </h1>
                    <p className="mb-10 text-lg text-zinc-600 dark:text-zinc-400">
                        Scan a barcode to uncover the real ingredients. We cross-reference 5 sources to ensure accuracy and highlight allergens.
                    </p>
                </div>

                {/* Input Section */}
                <div className="mx-auto max-w-xl">
                    <div className="relative flex items-center gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                        <div className="relative flex-1">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <Search className="h-5 w-5 text-zinc-400" />
                            </div>
                            <input
                                type="text"
                                value={barcode}
                                onChange={(e) => setBarcode(e.target.value)}
                                placeholder="Enter barcode number..."
                                className="block w-full rounded-xl border-0 bg-transparent py-3 pl-10 pr-4 text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 dark:text-zinc-100"
                            />
                        </div>

                        <div className="flex items-center gap-2 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                            <button
                                onClick={() => setIsScanning(true)}
                                className="group flex items-center justify-center rounded-xl p-3 text-zinc-500 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800"
                                title="Scan Barcode"
                            >
                                <Scan className="h-5 w-5 transition-transform group-hover:scale-110" />
                            </button>

                            <button
                                onClick={handleAnalyze}
                                disabled={!barcode || isAnalyzing}
                                className={twMerge(
                                    "flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all",
                                    isAnalyzing && "pl-4 pr-4"
                                )}
                            >
                                {isAnalyzing ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <>
                                        Analyze
                                        <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <p className="mt-4 text-center text-xs text-zinc-500">
                        Supports EAN-13, UPC-A, and most common food barcodes.
                    </p>

                    {error && (
                        <div className="mt-6 rounded-xl bg-red-50 p-4 text-center text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                {/* Scanner Modal */}
                {isScanning && (
                    <Scanner
                        onScanSuccess={handleScanSuccess}
                        onClose={() => setIsScanning(false)}
                    />
                )}
            </div>
        </main>
    );
}
