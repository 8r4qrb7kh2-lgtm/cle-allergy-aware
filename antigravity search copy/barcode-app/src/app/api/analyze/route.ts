import { NextRequest, NextResponse } from 'next/server';
import { analyzeIngredients } from '@/app/lib/ai';
import { findAndScrapeSources, ScrapedSource } from '@/app/lib/pipeline';

export async function POST(req: NextRequest) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
            };

            try {
                const { barcode } = await req.json();

                if (!barcode) {
                    send({ type: 'error', message: 'Barcode is required' });
                    controller.close();
                    return;
                }

                send({ type: 'status', message: `Starting analysis for barcode ${barcode}...` });

                const verifiedSources: any[] = [];
                const allVisitedUrls = new Set<string>();
                const MAX_CYCLES = 5;
                const TARGET_SOURCES = 5;

                let knownTitle = "";

                for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
                    const needed = TARGET_SOURCES - verifiedSources.length;
                    if (needed <= 0) break;

                    send({ type: 'status', message: `Cycle ${cycle}/${MAX_CYCLES}: Looking for ${needed} more verified sources...` });

                    // 1. Find Candidates
                    const { sources: candidates, title: foundTitle } = await findAndScrapeSources(
                        barcode,
                        allVisitedUrls,
                        needed + 2, // Ask for a few extras to buffer against AI rejection
                        (msg) => send({ type: 'status', message: msg }),
                        knownTitle // Pass known title if available
                    );

                    // Update knownTitle if we found a better one
                    if (!knownTitle && foundTitle) {
                        knownTitle = foundTitle;
                    }

                    // Try to extract title from candidates if we don't have one yet (Fallback)
                    if (!knownTitle && candidates.length > 0) {
                        // Simple heuristic: take the most common title or just the first good one
                        // Since findAndScrapeSources already filters by "bestTitle", we can assume
                        // the title used there was good. But we don't return it explicitly.
                        // We can try to re-extract it or just rely on the fact that candidates are valid.
                        // Let's peek at the first candidate's title if it looks like a product name.
                        const first = candidates.find(c => c.title && c.title.length > 5);
                        if (first) knownTitle = first.title; // This is a rough approximation, but better than nothing.
                    }

                    if (candidates.length === 0) {
                        send({ type: 'status', message: "No new candidates found in this cycle." });
                        // Continue to next cycle even if empty, as next cycle might use different search strategy
                    }

                    // 2. Verify with AI (Intermediate Pass)
                    if (candidates.length > 0) {
                        send({ type: 'status', message: `Verifying ${candidates.length} candidates with AI...` });

                        // We use the AI to check if these sources *actually* have ingredients
                        // We pass them in batches if needed, but for < 10, one call is fine.
                        const analysis = await analyzeIngredients(candidates);

                        const goodSources = analysis.sources.filter((s: any) => s.hasIngredients);
                        send({ type: 'status', message: `AI verified ${goodSources.length} valid sources.` });

                        // Add to verified list (deduplicating by DOMAIN)
                        for (const s of goodSources) {
                            try {
                                const sDomain = new URL(s.url).hostname.replace('www.', '');
                                const alreadyHasDomain = verifiedSources.some(v => {
                                    try {
                                        return new URL(v.url).hostname.replace('www.', '') === sDomain;
                                    } catch { return false; }
                                });

                                if (!alreadyHasDomain) {
                                    verifiedSources.push(s);
                                }
                            } catch (e) {
                                // If URL parsing fails, fall back to strict URL check
                                if (!verifiedSources.some(v => v.url === s.url)) {
                                    verifiedSources.push(s);
                                }
                            }
                        }
                    }

                    if (verifiedSources.length >= TARGET_SOURCES) {
                        send({ type: 'status', message: "Target source count reached!" });
                        break;
                    }
                }

                // 3. Final Analysis
                if (verifiedSources.length === 0) {
                    send({ type: 'error', message: 'Could not find any verified sources with ingredients.' });
                    controller.close();
                    return;
                }

                send({ type: 'status', message: `Generating final report from ${verifiedSources.length} sources...` });

                // We re-run analyzeIngredients on the FINAL set to get the unified list and dietary compliance
                // This might seem redundant for the sources we just checked, but we need to merge them all together.
                // Optimization: We could pass the *previous* analysis results if we merged them manually, 
                // but re-running ensures the "Unified List" considers ALL sources together.
                const finalAnalysis = await analyzeIngredients(verifiedSources);

                send({ type: 'result', data: finalAnalysis });
                controller.close();

            } catch (error: any) {
                console.error('Analysis error:', error);
                // Send detailed error if available
                const errorMsg = error.message || 'Internal server error';
                const errorDetails = error.text ? `\nRaw Response: ${error.text}` : '';
                send({ type: 'error', message: `${errorMsg}${errorDetails}` });
                controller.close();
            }
        }
    });

    return new NextResponse(stream, {
        headers: { 'Content-Type': 'application/json' }
    });
}
