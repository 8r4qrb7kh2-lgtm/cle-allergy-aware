"use client";

import { AlertTriangle, Check, ExternalLink, AlertCircle, Leaf, CheckCircle2, XCircle } from "lucide-react";

interface ResultsProps {
    data: {
        productName: string;
        unifiedIngredientList: string[];
        differences: {
            ingredient: string;
            presentIn: string[];
            missingIn: string[];
            note?: string;
        }[];
        top9Allergens: string[];
        dietaryCompliance: {
            vegan: { isCompliant: boolean; reason?: string };
            vegetarian: { isCompliant: boolean; reason?: string };
            pescatarian: { isCompliant: boolean; reason?: string };
            glutenFree: { isCompliant: boolean; reason?: string };
        };
        sources: {
            url: string;
            ingredients: string[];
            hasIngredients: boolean;
        }[];
    };
    onReset: () => void;
}

export default function Results({ data, onReset }: ResultsProps) {
    const getHostname = (url: string) => {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return url; // Fallback to full string if invalid URL
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {data.productName}
                </h2>
                <p className="mt-1 text-zinc-500">
                    Analyzed from {data.sources.filter(s => s.hasIngredients).length} sources
                </p>
            </div>

            {/* Dietary Compliance */}
            <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    <Leaf className="h-5 w-5 text-green-500" />
                    Dietary Compliance
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    {Object.entries(data.dietaryCompliance || {}).map(([diet, status]) => (
                        <div key={diet} className="flex items-start gap-3 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
                            {status.isCompliant ? (
                                <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500" />
                            ) : (
                                <XCircle className="mt-0.5 h-5 w-5 text-red-500" />
                            )}
                            <div>
                                <div className="font-medium capitalize text-zinc-900 dark:text-zinc-100">
                                    {diet.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                                {status.reason && (
                                    <p className="mt-1 text-sm text-zinc-500">
                                        {status.reason}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Allergens */}
            <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    Allergen Check
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                    {data.top9Allergens.length > 0 ? (
                        Object.entries(
                            data.top9Allergens.reduce((acc, str) => {
                                const match = str.match(/^(.*?) \((.*?)\)$/);
                                const name = match ? match[1] : str;
                                const trigger = match ? match[2] : null;
                                if (!acc[name]) acc[name] = [];
                                if (trigger) acc[name].push(trigger);
                                return acc;
                            }, {} as Record<string, string[]>)
                        ).map(([allergenName, triggers]) => (
                            <div key={allergenName} className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50/50 p-3 dark:border-red-900/30 dark:bg-red-900/10">
                                <AlertTriangle className="mt-0.5 h-5 w-5 text-red-500" />
                                <div>
                                    <div className="font-medium text-red-900 dark:text-red-100">
                                        {allergenName}
                                    </div>
                                    {triggers.length > 0 && (
                                        <ul className="mt-1 list-inside list-disc text-sm text-red-700 dark:text-red-300">
                                            {triggers.map((trigger, i) => (
                                                <li key={i}>{trigger}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full flex items-start gap-3 rounded-xl border border-green-100 bg-green-50/50 p-3 dark:border-green-900/30 dark:bg-green-900/10">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500" />
                            <div>
                                <div className="font-medium text-green-900 dark:text-green-100">
                                    No Allergens Detected
                                </div>
                                <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                                    No top 9 allergens found in the unified ingredient list.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Unified Ingredients */}
            <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Unified Ingredient List
                </h3>
                <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {data.unifiedIngredientList.join(", ")}
                </p>
            </div>

            {/* Source Consistency */}
            <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    <CheckCircle2 className={data.differences.length > 0 ? "h-5 w-5 text-amber-500" : "h-5 w-5 text-green-500"} />
                    Source Consistency
                </h3>

                {data.differences.length > 0 ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-200">
                            Found {data.differences.length} discrepancies between sources.
                        </div>
                        {data.differences.map((diff, idx) => (
                            <div key={idx} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                                <div className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                                    {diff.ingredient}
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <span className="text-xs font-semibold uppercase text-green-600 dark:text-green-400">
                                            Present In
                                        </span>
                                        <ul className="mt-1 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                                            {diff.presentIn.map((url, i) => (
                                                <li key={i} className="truncate">
                                                    <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                                                        {getHostname(url)}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold uppercase text-red-600 dark:text-red-400">
                                            Missing In
                                        </span>
                                        <ul className="mt-1 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                                            {diff.missingIn.map((url, i) => (
                                                <li key={i} className="truncate">
                                                    <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                                                        {getHostname(url)}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                {diff.note && (
                                    <p className="mt-2 text-sm italic text-zinc-500">
                                        Note: {diff.note}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <Check className="h-5 w-5" />
                        <span>All sources agree on the ingredient list. No discrepancies found.</span>
                    </div>
                )}
            </div>

            {/* Source Details */}
            <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Source Details
                </h3>
                <div className="space-y-6">
                    {data.sources.filter(s => s.hasIngredients).map((source, idx) => (
                        <div key={idx} className="border-b border-zinc-100 pb-4 last:border-0 last:pb-0 dark:border-zinc-800">
                            <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                                <ExternalLink className="h-4 w-4" />
                                {getHostname(source.url)}
                            </a>
                            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                                {source.ingredients.join(", ")}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <button
                onClick={onReset}
                className="w-full rounded-xl bg-zinc-100 py-3 font-semibold text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
                Scan Another Item
            </button>
        </div>
    );
}
