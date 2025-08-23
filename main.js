import React, { useState, useEffect, useRef } from 'react';

// Helper function to fetch PDB data
const fetchPdbData = async (pdbId) => {
    if (!pdbId) return null;
    // Standardize PDB ID to uppercase as a defensive measure.
    const upperCasePdbId = pdbId.toUpperCase();
    
    // List of URLs to try for fetching the PDB file.
    const urlsToTry = [
        `https://files.rcsb.org/view/${upperCasePdbId}.pdb`,
        `https://models.rcsb.org/${upperCasePdbId}.pdb`
    ];

    // Iterate through the URLs and try to fetch the data.
    for (const url of urlsToTry) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                console.log(`Successfully fetched PDB data from ${url}`);
                return await response.text(); // Return the data on success
            } else {
                // Log a warning if a specific URL fails, then try the next one.
                console.warn(`Failed to fetch from ${url}, status: ${response.status}`);
            }
        } catch (error) {
            // Log an error if the fetch itself fails (e.g., network error).
            console.error(`Error fetching from ${url}:`, error);
        }
    }

    // If all URLs fail, log a final error and return null.
    console.error(`Failed to fetch PDB data for ${upperCasePdbId} from all sources.`);
    return null;
};


// Placeholder for a 3Dmol.js viewer
const ProteinViewer = ({ pdbData }) => {
    const viewerRef = useRef(null);
    const glviewer = useRef(null);

    useEffect(() => {
        // Dynamically load the 3Dmol.js script
        const script = document.createElement('script');
        script.src = 'https://3dmol.org/build/3Dmol-min.js';
        script.async = true;
        script.onload = () => {
            if (viewerRef.current && window.$3Dmol) {
                if (!glviewer.current) {
                    glviewer.current = window.$3Dmol.createViewer(viewerRef.current, {
                        defaultcolors: window.$3Dmol.rasmolElementColors
                    });
                }
                glviewer.current.clear();
                if (pdbData) {
                    glviewer.current.addModel(pdbData, "pdb");
                    glviewer.current.setStyle({}, { cartoon: { color: 'spectrum' } });
                    glviewer.current.zoomTo();
                    glviewer.current.render();
                } else {
                     // Show a default visualization or placeholder
                    glviewer.current.addSphere({center:{x:0,y:0,z:0},radius:10.0,color:'blue',alpha:0.5});
                    glviewer.current.zoomTo();
                    glviewer.current.render();
                }
            }
        };
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, []); // Load script once

    useEffect(() => {
        if (pdbData && glviewer.current) {
            glviewer.current.clear();
            glviewer.current.addModel(pdbData, "pdb");
            glviewer.current.setStyle({}, { cartoon: { color: 'spectrum' } });
            glviewer.current.zoomTo();
            glviewer.current.render();
        }
    }, [pdbData]);


    return (
        <div ref={viewerRef} className="w-full h-full min-h-[400px] relative bg-gray-900 rounded-lg border border-gray-700">
            {!pdbData && (
                 <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    3D structure will be displayed here
                </div>
            )}
        </div>
    );
};

// Main App Component
export default function App() {
    const [prompt, setPrompt] = useState('A small, stable protein that can bind to caffeine.');
    const [generatedSequence, setGeneratedSequence] = useState('');
    const [pdbData, setPdbData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [analysis, setAnalysis] = useState('');
    
    const callGeminiAPI = async (userPrompt) => {
        const apiKey = ""; // Leave empty, will be handled by the environment
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        // This structured prompt guides the model to perform the specific tasks we need.
        const fullPrompt = `
            You are a world-class computational biologist AI specializing in de novo protein design.
            Your task is to generate a plausible amino acid sequence for a novel protein based on a functional description, and then identify a real, structurally similar protein from the PDB database to serve as a visual and structural template.

            User's desired function: "${userPrompt}"

            Follow these steps precisely:
            1.  **Analyze the function:** Briefly describe the key structural features a protein would need to perform this function. For example, what kind of binding pocket or active site is required?
            2.  **Generate Sequence:** Create a plausible, novel amino acid sequence (between 80 and 150 residues) for a protein that could have these features. The sequence must be chemically and structurally plausible.
            3.  **Find PDB Template:** Identify a real protein entry in the PDB (Protein Data Bank) that has a similar function or structure. This will be used for visualization. Provide its 4-character PDB ID.
            4.  **Format Output:** Return a single JSON object with the following keys: "analysis" (your analysis from step 1), "sequence" (the generated sequence from step 2), and "pdb_id" (the PDB ID from step 3).

            Example output format:
            {
              "analysis": "To bind caffeine, the protein needs a hydrophobic pocket with specific polar contacts to interact with the caffeine molecule's nitrogen and oxygen atoms.",
              "sequence": "MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK",
              "pdb_id": "5DDO"
            }
        `;

        const payload = {
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            }
        };
        
        // Exponential backoff for retries
        let response;
        let delay = 1000;
        for (let i = 0; i < 5; i++) {
            try {
                response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (response.ok) break;
            } catch (error) {
                 // ignore and retry
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }

        if (!response || !response.ok) {
            throw new Error("Failed to get a valid response from the AI model after several retries.");
        }

        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            throw new Error("The AI model returned an empty response.");
        }

        return JSON.parse(text);
    };


    const handleGenerate = async () => {
        setIsLoading(true);
        setError('');
        setGeneratedSequence('');
        setPdbData(null);
        setAnalysis('');

        try {
            const result = await callGeminiAPI(prompt);

            if (!result.sequence || !result.pdb_id || !result.analysis) {
                throw new Error("AI response was missing required fields (sequence, pdb_id, analysis).");
            }

            setGeneratedSequence(result.sequence);
            setAnalysis(result.analysis);

            // Fetch the PDB data for visualization based on the ID the AI provided
            const pdb = await fetchPdbData(result.pdb_id);
            if (pdb) {
                setPdbData(pdb);
            } else {
                setError(`Could not fetch 3D structure for PDB ID: ${result.pdb_id}. Displaying sequence only.`);
            }

        } catch (err) {
            console.error(err);
            setError(`An error occurred: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-gray-900 text-gray-200 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-cyan-400">De Novo Protein Designer</h1>
                    <p className="mt-2 text-lg text-gray-400">Generate novel protein structures from functional descriptions using AI.</p>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Panel: Input and Results */}
                    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col space-y-6">
                        <div>
                            <label htmlFor="prompt" className="block text-lg font-medium text-cyan-400 mb-2">1. Describe Desired Protein Function</label>
                            <textarea
                                id="prompt"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full h-32 p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition duration-200 text-gray-200"
                                placeholder="e.g., An enzyme that can bind to and degrade PET plastic..."
                            />
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-md hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center text-lg"
                        >
                            {isLoading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Generating...
                                </>
                            ) : (
                                'Generate Protein'
                            )}
                        </button>

                        {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-md">{error}</div>}

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-medium text-cyan-400 mb-2">2. AI Analysis</h3>
                                <div className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md min-h-[80px] text-gray-300 italic">
                                    {analysis || "AI's analysis of required structural features will appear here."}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-cyan-400 mb-2">3. Generated Amino Acid Sequence</h3>
                                <div className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md font-mono text-sm break-words min-h-[120px]">
                                    {generatedSequence || "Generated sequence will appear here."}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: 3D Viewer */}
                    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col">
                         <h2 className="text-lg font-medium text-cyan-400 mb-4 text-center">4. Predicted 3D Structure (Visualized using PDB Template)</h2>
                         <div className="flex-grow">
                            <ProteinViewer pdbData={pdbData} />
                         </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
