import React, { useState, useEffect, useRef } from 'react';

// Helper function to fetch PDB data
const fetchPdbData = async (pdbId) => {
    if (!pdbId) return null;
    const upperCasePdbId = pdbId.toUpperCase();
    const urlsToTry = [
        `https://files.rcsb.org/view/${upperCasePdbId}.pdb`,
        `https://models.rcsb.org/${upperCasePdbId}.pdb`
    ];

    for (const url of urlsToTry) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                console.log(`Successfully fetched PDB data from ${url}`);
                return await response.text();
            } else {
                console.warn(`Failed to fetch from ${url}, status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching from ${url}:`, error);
        }
    }
    console.error(`Failed to fetch PDB data for ${upperCasePdbId} from all sources.`);
    return null;
};

// 3Dmol.js viewer component
const ProteinViewer = ({ pdbData, bindingPocketResidues }) => {
    const viewerRef = useRef(null);
    const glviewer = useRef(null);
    const [highlight, setHighlight] = useState(false);

    const setupViewer = () => {
        if (viewerRef.current && window.$3Dmol) {
            if (!glviewer.current) {
                glviewer.current = window.$3Dmol.createViewer(viewerRef.current, {
                    defaultcolors: window.$3Dmol.rasmolElementColors
                });
            }
            renderStructure();
        }
    };

    const renderStructure = () => {
        if (!glviewer.current) return;
        glviewer.current.clear();
        if (pdbData) {
            glviewer.current.addModel(pdbData, "pdb");
            glviewer.current.setStyle({}, { cartoon: { color: 'spectrum' } });

            if (highlight && bindingPocketResidues && bindingPocketResidues.length > 0) {
                const sel = { resi: bindingPocketResidues };
                glviewer.current.addStyle(sel, { stick: { colorscheme: 'yellowCarbon', radius: 0.2 } });
                glviewer.current.addStyle(sel, { sphere: { color: 'yellow', radius: 0.5, alpha: 0.7 } });
            }
            
            glviewer.current.zoomTo();
            glviewer.current.render();
        } else {
            glviewer.current.addSphere({center:{x:0,y:0,z:0},radius:10.0,color:'rgba(55, 65, 81, 0.5)'});
            glviewer.current.zoomTo();
            glviewer.current.render();
        }
    };

    useEffect(() => {
        const scriptId = '3dmol-script';
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://3dmol.org/build/3Dmol-min.js';
            script.async = true;
            script.onload = setupViewer;
            document.body.appendChild(script);
            return () => { document.body.removeChild(script); };
        } else {
            setupViewer();
        }
    }, []);

    useEffect(() => {
        renderStructure();
    }, [pdbData, highlight, bindingPocketResidues]);

    return (
        <div className="w-full h-full flex flex-col">
            <div ref={viewerRef} className="flex-grow min-h-[400px] relative bg-gray-900 rounded-lg border border-gray-700">
                {!pdbData && (
                     <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        3D structure will be displayed here
                    </div>
                )}
            </div>
            {pdbData && bindingPocketResidues && (
                <div className="flex justify-center items-center mt-4">
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" checked={highlight} onChange={() => setHighlight(!highlight)} className="sr-only" />
                            <div className="block bg-gray-600 w-14 h-8 rounded-full"></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${highlight ? 'transform translate-x-full bg-cyan-400' : ''}`}></div>
                        </div>
                        <div className="ml-3 text-gray-300 font-medium">Highlight Binding Pocket</div>
                    </label>
                </div>
            )}
        </div>
    );
};


// Main App Component
export default function App() {
    const [prompt, setPrompt] = useState('An enzyme that can bind to and degrade PET plastic.');
    const [evolutionPrompt, setEvolutionPrompt] = useState('Improve binding affinity by 10%.');
    const [generatedSequence, setGeneratedSequence] = useState('');
    const [pdbData, setPdbData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [analysis, setAnalysis] = useState('');
    const [bindingAffinity, setBindingAffinity] = useState(null);
    const [predictedStability, setPredictedStability] = useState(null);
    const [bindingPocketResidues, setBindingPocketResidues] = useState([]);
    
    const callGeminiAPI = async (userPrompt, evolutionParams = null) => {
        const apiKey = ""; // Leave empty
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        let fullPrompt;
        if (evolutionParams) {
            fullPrompt = `
                You are a world-class computational biologist AI specializing in protein evolution.
                Your task is to evolve an existing protein sequence to improve its function based on user feedback.

                Previous Sequence: "${evolutionParams.sequence}"
                User's Goal for Evolution: "${evolutionParams.feedback}"

                Follow these steps precisely:
                1.  **Analyze Goal:** Briefly describe the mutations required to achieve the goal.
                2.  **Evolve Sequence:** Generate a new sequence with targeted mutations.
                3.  **Simulate Binding:** Provide an updated "binding_affinity_score" (kcal/mol).
                4.  **Predict Stability:** Provide an updated "predicted_stability_score".
                5.  **Identify Binding Pocket:** List the key residue numbers forming the binding pocket as an array of integers in "binding_pocket_residues".
                6.  **Find PDB Template:** Identify a real PDB entry with a similar structural fold for visualization. Provide its 4-character "pdb_id".
                7.  **Format Output:** Return a single JSON object with all the required keys. Do not include any text outside of the JSON object.
            `;
        } else {
            fullPrompt = `
                You are a world-class computational biologist AI. Your task is to perform a complete *de novo* protein design workflow.

                User's desired function: "${userPrompt}"

                Follow these steps precisely:
                1.  **Analyze Function:** Describe the key structural and chemical features required.
                2.  **Generate Sequence:** Create a plausible, novel amino acid sequence (80-150 residues).
                3.  **Simulate Binding:** Perform a simulated molecular docking. Provide a "binding_affinity_score" in kcal/mol.
                4.  **Predict Stability:** Calculate a "predicted_stability_score".
                5.  **Identify Binding Pocket:** List the key residue numbers forming the binding pocket as an array of integers in "binding_pocket_residues".
                6.  **Find PDB Template:** Identify a real PDB entry with a similar structural fold for visualization. Provide its 4-character "pdb_id".
                7.  **Format Output:** Return a single JSON object with all the required keys. Do not include any text outside of the JSON object.
            `;
        }

        const payload = {
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        };
        
        let response;
        let delay = 1000;
        for (let i = 0; i < 5; i++) {
            try {
                response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (response.ok) break;
            } catch (error) { /* ignore and retry */ }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }

        if (!response || !response.ok) throw new Error("AI model failed to respond after retries.");
        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("The AI model returned an empty response.");
        
        // Robustly parse the JSON from the AI response, cleaning up markdown and other text.
        let jsonString = text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch && jsonMatch[0]) {
            jsonString = jsonMatch[0];
        } else {
             jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse AI response as JSON:", jsonString);
            throw new Error("AI response was not valid JSON.");
        }
    };

    const processApiResponse = async (apiCall) => {
        setIsLoading(true);
        setError('');
        try {
            const result = await apiCall;
            
            if (typeof result !== 'object' || result === null) {
                 throw new Error("AI response was not a valid object.");
            }

            // More robust check. If the essential data isn't there, fail gracefully with a more informative error.
            // Accommodate for slight variations in AI response keys.
            const sequence = result.sequence || result.generated_sequence;
            const pdbId = result.pdb_id;

            if (!sequence || !pdbId) {
                console.error("Incomplete AI response received:", result);
                // Try to find a meaningful error message from the AI's response to show the user.
                const reason = result.analysis || result.analysis_function || result.error || "The AI did not provide a valid reason for failure.";
                throw new Error(`AI response was incomplete. Reason provided: "${reason}"`);
            }

            setGeneratedSequence(sequence);
            setAnalysis(result.analysis || result.analysis_function || "Analysis not provided by AI.");
            setBindingAffinity(result.binding_affinity_score || result.simulated_binding_affinity_score || null);
            setPredictedStability(result.predicted_stability_score || null);
            setBindingPocketResidues(result.binding_pocket_residues || []);

            const pdb = await fetchPdbData(pdbId);
            if (pdb) {
                setPdbData(pdb);
            } else {
                setError(`Could not fetch 3D structure for PDB ID: ${pdbId}. Displaying results only.`);
                setPdbData(null);
            }
        } catch (err) {
            console.error(err);
            // Display the more informative error message to the user.
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGenerate = () => {
        processApiResponse(callGeminiAPI(prompt));
    };

    const handleEvolve = () => {
        if (!generatedSequence) {
            setError("You must generate a protein first before evolving it.");
            return;
        }
        const evolutionParams = { sequence: generatedSequence, feedback: evolutionPrompt };
        processApiResponse(callGeminiAPI(null, evolutionParams));
    };

    return (
        <div className="bg-gray-900 text-gray-200 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-cyan-400">Evolutionary Protein Designer</h1>
                    <p className="mt-2 text-lg text-gray-400">Design, analyze, and evolve novel proteins with AI.</p>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Panel */}
                    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col space-y-6">
                        <div>
                            <label htmlFor="prompt" className="block text-lg font-medium text-cyan-400 mb-2">1. Describe Initial Desired Function</label>
                            <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full h-24 p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-cyan-500 transition" placeholder="e.g., An enzyme that can bind to and degrade PET plastic..."/>
                        </div>
                        <button onClick={handleGenerate} disabled={isLoading} className="w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-md hover:bg-cyan-500 disabled:bg-gray-600 transition flex items-center justify-center text-lg">
                            {isLoading ? 'Designing...' : 'Run Initial Design'}
                        </button>
                        
                        {generatedSequence && (
                            <div className="border-t-2 border-cyan-800/50 pt-6 space-y-4">
                                <h3 className="text-lg font-medium text-cyan-400 mb-2">2. Evolve This Design</h3>
                                <textarea value={evolutionPrompt} onChange={(e) => setEvolutionPrompt(e.target.value)} className="w-full h-20 p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-cyan-500 transition" placeholder="e.g., Increase stability in high temperatures."/>
                                <button onClick={handleEvolve} disabled={isLoading} className="w-full bg-purple-600 text-white font-bold py-3 px-4 rounded-md hover:bg-purple-500 disabled:bg-gray-600 transition flex items-center justify-center text-lg">
                                    {isLoading ? 'Evolving...' : 'Evolve Protein'}
                                </button>
                            </div>
                        )}

                        {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-md">{error}</div>}

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-medium text-cyan-400 mb-2">3. AI Analysis</h3>
                                <div className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md min-h-[80px] text-gray-300 italic">{analysis || "AI's analysis will appear here."}</div>
                            </div>
                             <div>
                                <h3 className="text-lg font-medium text-cyan-400 mb-2">4. Performance Metrics</h3>
                                <div className="grid grid-cols-2 gap-4 text-center">
                                    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                                        <div className="text-sm text-gray-400">Binding Affinity</div>
                                        <div className={`text-2xl font-bold ${bindingAffinity ? 'text-green-400' : 'text-gray-500'}`}>{bindingAffinity ? `${bindingAffinity} kcal/mol` : 'N/A'}</div>
                                    </div>
                                    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                                        <div className="text-sm text-gray-400">Predicted Stability</div>
                                        <div className={`text-2xl font-bold ${predictedStability ? (predictedStability > 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`}>{predictedStability ? predictedStability.toFixed(2) : 'N/A'}</div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-cyan-400 mb-2">5. Generated Amino Acid Sequence</h3>
                                <div className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md font-mono text-sm break-words min-h-[120px]">{generatedSequence || "Generated sequence will appear here."}</div>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel */}
                    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col">
                         <h2 className="text-lg font-medium text-cyan-400 mb-4 text-center">6. Predicted 3D Structure</h2>
                         <div className="flex-grow">
                            <ProteinViewer pdbData={pdbData} bindingPocketResidues={bindingPocketResidues} />
                         </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
