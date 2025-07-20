import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// --- Helper Components & Data ---

const sampleJsonData = [
    { "bounds": "[100,200][980,400]", "text": "Welcome Screen Title", "is_clickable": false, "resource_id": "com.example.app:id/title" },
    { "bounds": "[400,1800][680,1950]", "text": "Login Button", "is_clickable": true, "resource_id": "com.example.app:id/login_button" },
    { "bounds": "[0,1195][1080,1404]", "class_name": "android.widget.LinearLayout", "content_description": "Mummy chat, 1 unread message", "is_clickable": true, "resource_id": "com.whatsapp:id/contact_row_container", "text": "Mummy | 7:28 PM | https://www.facebook.com/... | 1 unread message" },
    { "bounds": "[50,500][300,600]", "text": "Profile Picture", "is_clickable": true, "resource_id": "com.example.app:id/profile_pic" },
    { "bounds": "[350,500][900,600]", "text": "User Name Input", "is_clickable": false, "resource_id": "com.example.app:id/username_input" },
    { "bounds": "[0,247][1080,412]", "class_name": "android.widget.FrameLayout", "is_clickable": true, "resource_id": "com.whatsapp:id/my_search_bar", "text": "Ask Meta AI or Search" }
];

const sampleScreenName = "login_screen";

const sampleHighlightJson = { "bounds": "[0,247][1080,412]", "class_name": "android.widget.FrameLayout", "is_clickable": true, "resource_id": "com.whatsapp:id/my_search_bar", "text": "Ask Meta AI or Search" };

const GlobalStyles = () => (
    <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3b82f6; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `}</style>
);



// --- Main App Component ---

export default function App() {
    const mountRef = useRef(null);
    const tooltipRef = useRef(null);
    const threeJsObjects = useRef({});

    const [jsonInput, setJsonInput] = useState(JSON.stringify(sampleJsonData, null, 2));
    const [highlightJsonInput, setHighlightJsonInput] = useState(JSON.stringify(sampleHighlightJson, null, 2));
    const [screenName, setScreenName] = useState(sampleScreenName);
    const [elementCount, setElementCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedElement, setSelectedElement] = useState(null);
    const [isHighlightModified, setIsHighlightModified] = useState(false);
    const [elementInfo, setElementInfo] = useState('');
    const [screenshotUrl, setScreenshotUrl] = useState('');
    const [showScreenshot, setShowScreenshot] = useState(false);
    const [isScreenshotEnlarged, setIsScreenshotEnlarged] = useState(false);
    const [isZipUploaded, setIsZipUploaded] = useState(false);
    const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
    const [screens, setScreens] = useState([]);
    const [isLoadingZip, setIsLoadingZip] = useState(false);

    const showError = (message) => {
        setError(message);
        setTimeout(() => setError(''), 3000);
    };

    const handleDeleteElement = useCallback((elementToDelete) => {
        try {
            const currentElements = JSON.parse(jsonInput);
            // Filter out the element. A deep-enough comparison for robustness.
            const newElements = currentElements.filter(el => 
                !(el.bounds === elementToDelete.bounds && el.text === elementToDelete.text && el.resource_id === elementToDelete.resource_id)
            );
            setJsonInput(JSON.stringify(newElements, null, 2));
            setSelectedElement(null); // Close the panel after deletion
        } catch (e) {
            showError("Could not delete element. JSON may be malformed.");
        }
    }, [jsonInput]);

    const handleSaveHighlightChanges = useCallback(() => {
        try {
            const editedElement = JSON.parse(highlightJsonInput);
            const currentElements = JSON.parse(jsonInput);
            
            // Add information field if provided
            if (elementInfo.trim()) {
                editedElement.information = elementInfo.trim();
            }
            
            // Find and replace the element in the main JSON
            const elementIndex = currentElements.findIndex(el => 
                el.bounds === selectedElement.bounds && 
                el.text === selectedElement.text && 
                el.resource_id === selectedElement.resource_id
            );
            
            if (elementIndex !== -1) {
                currentElements[elementIndex] = editedElement;
                const updatedJson = JSON.stringify(currentElements, null, 2);
                setJsonInput(updatedJson);
                setSelectedElement(editedElement); // Update selected element with new data
                setIsHighlightModified(false);
                
                // Auto-save to localStorage (only for ZIP upload mode)
                if (isZipUploaded && screens.length > 0 && screens[currentScreenIndex]) {
                    saveToLocalStorage(screens[currentScreenIndex].number, updatedJson);
                }
                
                showError("Element updated successfully!");
            } else {
                showError("Could not find element to update.");
            }
        } catch (e) {
            showError("Invalid JSON format in highlight field!");
        }
    }, [highlightJsonInput, selectedElement, jsonInput, elementInfo, isZipUploaded, screens, currentScreenIndex]);

    const handleHighlightJsonChange = (e) => {
        setHighlightJsonInput(e.target.value);
        setIsHighlightModified(true);
    };

    const handleElementInfoChange = (e) => {
        setElementInfo(e.target.value);
        setIsHighlightModified(true);
    };

    const handleExportJson = () => {
        try {
            // Create the structured data according to the Screen data class
            const elements = JSON.parse(jsonInput);
            const screenData = {
                screenId: screenName || 'unnamed_screen',
                elements: elements
            };
            
            const dataStr = JSON.stringify(screenData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${screenName || 'ui-elements'}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showError("JSON exported successfully!");
        } catch (e) {
            showError("Failed to export JSON!");
        }
    };

    const handleScreenshotUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setScreenshotUrl(url);
            setShowScreenshot(true);
        }
    };



    const handleJsonInputChange = (e) => {
        const input = e.target.value;
        setJsonInput(input);
        
        // Try to parse and detect if it's in the new Screen format
        try {
            const parsed = JSON.parse(input);
            if (parsed.screenId && Array.isArray(parsed.elements)) {
                // It's in the new format, extract elements and screen name
                setScreenName(parsed.screenId);
                setJsonInput(JSON.stringify(parsed.elements, null, 2));
            }
        } catch (error) {
            // If parsing fails, just update the input as normal
        }
    };

    const handleZipUpload = async (event) => {
        const file = event.target.files[0];
        if (!file || !file.name.endsWith('.zip')) {
            showError("Please select a valid ZIP file");
            return;
        }

        setIsLoadingZip(true);
        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);
            
            const screens = [];
            const jsonFiles = [];
            const pngFiles = [];

            // Extract all files
            for (const [filename, fileData] of Object.entries(zipContent.files)) {
                if (filename.endsWith('.json')) {
                    jsonFiles.push({ filename, fileData });
                } else if (filename.endsWith('.png')) {
                    pngFiles.push({ filename, fileData });
                }
            }

            // Match JSON and PNG files by number
            for (const jsonFile of jsonFiles) {
                const number = jsonFile.filename.replace('.json', '');
                const pngFile = pngFiles.find(png => png.filename === `${number}.png`);
                
                if (pngFile) {
                    const jsonContent = await jsonFile.fileData.async('string');
                    const pngBase64 = await pngFile.fileData.async('base64');
                    const pngUrl = `data:image/png;base64,${pngBase64}`;
                    
                    console.log(`Processing screen ${number}:`, {
                        jsonFile: jsonFile.filename,
                        pngFile: pngFile.filename,
                        pngBase64Length: pngBase64.length,
                        pngUrl: pngUrl.substring(0, 50) + '...'
                    });
                    
                    screens.push({
                        number: parseInt(number),
                        json: jsonContent,
                        screenshot: pngUrl,
                        screenName: `screen_${number}`
                    });
                }
            }

            // Sort by number
            screens.sort((a, b) => a.number - b.number);
            
            setScreens(screens);
            setIsZipUploaded(true);
            setCurrentScreenIndex(0);
            
            // Load first screen
            if (screens.length > 0) {
                loadScreen(screens[0]);
            }
            
            showError(`Successfully loaded ${screens.length} screens`);
        } catch (error) {
            console.error('Error processing ZIP:', error);
            showError("Failed to process ZIP file");
        } finally {
            setIsLoadingZip(false);
        }
    };

    const loadScreen = (screen) => {
        try {
            console.log('Loading screen:', screen);
            // Check if we have saved data in localStorage
            const savedData = loadFromLocalStorage(screen.number);
            
            // Always use the original screenshot from the screen object
            console.log('Setting screenshot URL:', screen.screenshot);
            setScreenshotUrl(screen.screenshot);
            setShowScreenshot(true);
            
            if (savedData) {
                // Use saved JSON data if available
                setJsonInput(savedData.json);
            } else {
                // Use original data
                const parsed = JSON.parse(screen.json);
                if (parsed.screenId && Array.isArray(parsed.elements)) {
                    setScreenName(parsed.screenId);
                    setJsonInput(JSON.stringify(parsed.elements, null, 2));
                } else {
                    setScreenName(screen.screenName);
                    setJsonInput(screen.json);
                }
                
                // Save to localStorage
                saveToLocalStorage(screen.number, screen.json);
            }
        } catch (error) {
            showError("Failed to load screen data");
        }
    };

    const saveToLocalStorage = (screenNumber, jsonData) => {
        try {
            const key = `screen_${screenNumber}`;
            localStorage.setItem(key, JSON.stringify({
                json: jsonData,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    };

    const loadFromLocalStorage = (screenNumber) => {
        try {
            const key = `screen_${screenNumber}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
        return null;
    };

    const handleNextScreen = () => {
        if (currentScreenIndex < screens.length - 1) {
            const nextIndex = currentScreenIndex + 1;
            setCurrentScreenIndex(nextIndex);
            loadScreen(screens[nextIndex]);
        }
    };

    const handlePreviousScreen = () => {
        if (currentScreenIndex > 0) {
            const prevIndex = currentScreenIndex - 1;
            setCurrentScreenIndex(prevIndex);
            loadScreen(screens[prevIndex]);
        }
    };

    const handleVisualize = useCallback(() => {
        setIsLoading(true);
        const { scene, mainGroup, camera, controls } = threeJsObjects.current;
        if (!scene) {
             setIsLoading(false);
             return;
        }

        let parsedJson, highlightParsedJson;
        try {
            parsedJson = JSON.parse(jsonInput);
            highlightParsedJson = highlightJsonInput.trim() ? JSON.parse(highlightJsonInput) : null;
        } catch (e) {
            showError("Invalid JSON format!");
            setIsLoading(false);
            return;
        }

        // Clear previous visualization
        while (mainGroup.children.length > 0) {
            const object = mainGroup.children[0];
            object.geometry.dispose();
            if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
            else object.material.dispose();
            mainGroup.remove(object);
        }
        if (threeJsObjects.current.outlineMesh) {
            scene.remove(threeJsObjects.current.outlineMesh);
            threeJsObjects.current.outlineMesh.geometry.dispose();
            threeJsObjects.current.outlineMesh.material.dispose();
            threeJsObjects.current.outlineMesh = null;
        }
        threeJsObjects.current.intersectedObject = null;
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';

        // Create new visualization
        const SCREEN_WIDTH = 1080;
        const SCREEN_HEIGHT = 2400;
        const parseBounds = (boundsString) => {
            if (!boundsString) return null;
            const match = boundsString.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
            if (!match) return null;
            return { left: parseInt(match[1]), top: parseInt(match[2]), right: parseInt(match[3]), bottom: parseInt(match[4]) };
        };

        const uiElements = Array.isArray(parsedJson) ? parsedJson : [];
        const elementsWithArea = uiElements
            .map(element => {
                const bounds = parseBounds(element.bounds);
                if (!bounds) return null;
                return { element, bounds, area: (bounds.right - bounds.left) * (bounds.bottom - bounds.top) };
            })
            .filter(item => item !== null)
            .sort((a, b) => b.area - a.area);

        setElementCount(elementsWithArea.length);

        elementsWithArea.forEach((item, index) => {
            const { element, bounds } = item;
            const width = bounds.right - bounds.left;
            const height = bounds.bottom - bounds.top;
            const isHighlighted = highlightParsedJson && element.bounds === highlightParsedJson.bounds;
            const isLabeled = element.information && element.information.trim() !== '';

            // Determine color based on state
            let color;
            if (isHighlighted) {
                color = 0xef4444; // Red for highlighted
            } else if (isLabeled) {
                color = 0x8b5cf6; // Purple for labeled elements
            } else if (element.is_clickable) {
                color = 0x10b981; // Green for clickable
            } else {
                color = 0xf59e0b; // Orange for non-clickable
            }

            const geometry = new THREE.BoxGeometry(width, height, 20);
            const material = new THREE.MeshStandardMaterial({
                color: color,
                transparent: true, opacity: 0.75, metalness: 0.2, roughness: 0.7,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(bounds.left + width / 2 - SCREEN_WIDTH / 2, -(bounds.top + height / 2 - SCREEN_HEIGHT / 2), index * 10);
            mesh.userData = element;
            mainGroup.add(mesh);
        });

        // Adjust camera to fit the scene
        if (mainGroup.children.length > 0) {
            const box = new THREE.Box3().setFromObject(mainGroup);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(camera.fov * (Math.PI / 180) / 2));
            cameraZ *= 1.2;
            camera.position.set(center.x, center.y, center.z + cameraZ);
            controls.target.set(center.x, center.y, center.z);
            controls.update();
        }

        setIsLoading(false);
    }, [jsonInput, highlightJsonInput, isZipUploaded]);

    useEffect(() => {
        handleVisualize();
    }, [handleVisualize]);
  useEffect(() => {
        const handleKeyPress = (event) => {
            // Check if the 'Delete' key was pressed and if an element is selected
            if (event.key === 'q' && selectedElement) {
                handleDeleteElement(selectedElement);
            }
        };

        // Add the event listener to the window
        window.addEventListener('keydown', handleKeyPress);

        // Cleanup: remove the event listener when the component unmounts
        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [selectedElement, handleDeleteElement]); // Dependencies ensure the function has the latest data


// --- Add this new useEffect hook ---
    useEffect(() => {
        // When a new element is selected, update the highlight input field with its JSON
        if (selectedElement) {
            setHighlightJsonInput(JSON.stringify(selectedElement, null, 2));
            setIsHighlightModified(false); // Reset modification flag when selecting a new element
            setElementInfo(selectedElement.information || ''); // Load existing information if any
        }
    }, [selectedElement]); // This effect runs whenever 'selectedElement' changes


    useEffect(() => {
        const currentMount = mountRef.current;
        
        // Only initialize Three.js if we're in the labeling interface and mount exists
        if (!currentMount) {
            return;
        }
        
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111827);
        const mainGroup = new THREE.Group();
        scene.add(mainGroup);
        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 5000);
        camera.position.z = 1500;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        currentMount.appendChild(renderer.domElement);
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(200, 500, 1000);
        scene.add(directionalLight);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        threeJsObjects.current = { scene, camera, renderer, controls, mainGroup, raycaster, mouse };

        const handleResize = () => {
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };
        const handleMouseMove = (event) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            if (tooltipRef.current?.style.display === 'block') {
                tooltipRef.current.style.left = `${event.clientX - rect.left + 15}px`;
                tooltipRef.current.style.top = `${event.clientY - rect.top}px`;
            }
        };

        const handleClick = () => {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(mainGroup.children);
            if (intersects.length > 0) {
                setSelectedElement(intersects[0].object.userData);
            } else {
                setSelectedElement(null);
            }
        };

        const checkIntersection = () => {
            if (document.body.style.cursor === 'grabbing') return; // Don't check while panning
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(mainGroup.children);
            const newIntersected = intersects.length > 0 ? intersects[0].object : null;

            if (newIntersected !== threeJsObjects.current.intersectedObject) {
                if (threeJsObjects.current.intersectedObject) threeJsObjects.current.intersectedObject.material.opacity = 0.75;
                if (threeJsObjects.current.outlineMesh) scene.remove(threeJsObjects.current.outlineMesh);
                
                threeJsObjects.current.intersectedObject = newIntersected;
                if (newIntersected) {
                    newIntersected.material.opacity = 1.0;
                    const edges = new THREE.EdgesGeometry(newIntersected.geometry);
                    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
                    outline.position.copy(newIntersected.position);
                    threeJsObjects.current.outlineMesh = outline;
                    scene.add(outline);
                    if (tooltipRef.current) {
                        tooltipRef.current.style.display = 'block';
                        tooltipRef.current.innerHTML = `<b>Text:</b> ${newIntersected.userData.text || 'N/A'}<br/><b>ID:</b> ${newIntersected.userData.resource_id || 'N/A'}`;
                    }
                } else if(tooltipRef.current) {
                    tooltipRef.current.style.display = 'none';
                }
            }
        };

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            checkIntersection();
            renderer.render(scene, camera);
        };

        window.addEventListener('resize', handleResize);
        currentMount.addEventListener('mousemove', handleMouseMove);
        currentMount.addEventListener('click', handleClick);
        animate();

        return () => {
            if (currentMount) {
                window.removeEventListener('resize', handleResize);
                currentMount.removeEventListener('mousemove', handleMouseMove);
                currentMount.removeEventListener('click', handleClick);
                if (renderer && renderer.domElement) {
                    currentMount.removeChild(renderer.domElement);
                }
            }
        };
            }, [isZipUploaded]);

    // No cleanup needed for base64 URLs
    useEffect(() => {
        return () => {
            // Base64 URLs don't need cleanup
        };
    }, []);

    return (
        <>
            <GlobalStyles />
            {!isZipUploaded ? (
                // Upload Screen
                <div className="bg-gray-900 text-gray-200 flex items-center justify-center h-screen">
                    <div className="max-w-md w-full p-8">
                        <div className="text-center">
                            <h1 className="text-3xl font-bold mb-4 text-white">3D UI Labeling Tool</h1>
                            <p className="text-gray-400 mb-8">Upload a ZIP file containing JSON and PNG files to start labeling</p>
                            
                            <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
                                <input
                                    type="file"
                                    accept=".zip"
                                    onChange={handleZipUpload}
                                    className="hidden"
                                    id="zip-upload"
                                />
                                <label htmlFor="zip-upload" className="cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <p className="text-lg text-gray-300 mb-2">Click to upload ZIP file</p>
                                    <p className="text-sm text-gray-500">Should contain pairs like 1.json, 1.png</p>
                                </label>
                            </div>
                            
                            {isLoadingZip && (
                                <div className="mt-4 flex items-center justify-center gap-2">
                                    <div className="loader"></div>
                                    <span className="text-gray-400">Processing ZIP file...</span>
                                </div>
                            )}
                            
                            <div className="mt-8 pt-6 border-t border-gray-600">
                                <p className="text-gray-400 text-sm mb-4">Or continue with manual labeling:</p>
                                <button
                                    onClick={() => setIsZipUploaded(true)}
                                    className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg transition duration-300 flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    Start Manual Labeling
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                // Labeling Interface
                <div className="bg-gray-900 text-gray-200 flex flex-col md:flex-row h-screen">
                <div className="w-full md:w-1/3 h-full flex flex-col p-4 bg-gray-800 border-r border-gray-700 overflow-y-auto">
                    <div className="flex-grow">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h1 className="text-2xl font-bold mb-2 text-white">3D UI Visualizer</h1>
                                <p className="text-gray-400 text-sm">Paste UI JSON below. Click an element to select it.</p>
                            </div>
                            <div className="flex gap-2">
                                {selectedElement && (
                                    <button
                                        onClick={() => handleDeleteElement(selectedElement)}
                                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition duration-300 flex items-center gap-1"
                                        title="Use Q button to delete element (shortcut)"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        Delete
                                    </button>
                                )}
                                <button
                                    onClick={handleExportJson}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition duration-300 flex items-center gap-1"
                                    title="Export JSON"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Export
                                </button>
                            </div>
                        </div>
                        
                        <div className="mb-4">
                            <label htmlFor="screen-name" className="block text-sm font-medium text-white mb-2">
                                Screen Name
                            </label>
                            <input
                                id="screen-name"
                                type="text"
                                value={screenName}
                                onChange={(e) => setScreenName(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                placeholder="Enter screen name (e.g., login_screen, home_screen)"
                            />
                        </div>
                        
                        <textarea
                            value={jsonInput}
                            onChange={handleJsonInputChange}
                            className="w-full h-1/8 bg-gray-900 border border-gray-600 rounded-lg p-3 text-xs text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="Paste your main JSON here (elements array or Screen object)..."
                        />
                
                        <h2 className="text-xs font-bold mt-4 mb-2 text-white">Highlight Element (Optional)</h2>
                        <textarea
                            value={highlightJsonInput}
                            onChange={handleHighlightJsonChange}
                            className="w-full h-1/4 bg-gray-900 border border-gray-600 rounded-lg p-3 text-xs text-gray-300 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            placeholder="Paste JSON of element to highlight..."
                        />
                        {selectedElement && (
                            <>
                                <h3 className="text-xs font-bold mt-4 mb-2 text-white">Element Information</h3>
                                <textarea
                                    value={elementInfo}
                                    onChange={handleElementInfoChange}
                                    className="w-full h-20 bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    placeholder="Add information about what this element does..."
                                />
                            </>
                        )}
                        {isHighlightModified && (
                            <button
                                onClick={handleSaveHighlightChanges}
                                className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300 flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                Save Changes
                            </button>
                        )}
                    </div>
                    

                     

                    <div className="mt-4 pt-4 border-t border-gray-700 flex-shrink-0">
                        <h2 className="text-xl font-bold mb-2 text-white">Visualization Info</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-gray-400 text-sm">Total elements: <span className="font-bold text-white">{elementCount}</span></p>
                                <p className="text-gray-400 text-sm mt-1">Labeled elements: <span className="font-bold text-white">{JSON.parse(jsonInput).filter(el => el.information && el.information.trim() !== '').length}</span></p>
                                <p className="text-gray-400 text-sm mt-1">Show Screenshot: <span className="font-bold text-white">{String(showScreenshot)}</span></p>
                                <p className="text-gray-400 text-sm mt-1">Screenshot URL: <span className="font-bold text-white">{screenshotUrl ? 'Set' : 'Not Set'}</span></p>

                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-white mb-2">Color Legend:</h3>
                                <div className="flex flex-wrap gap-3 text-xs">
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                                        <span className="text-gray-300">Highlighted</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-purple-500 rounded"></div>
                                        <span className="text-gray-300">Labeled</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                                        <span className="text-gray-300">Clickable</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-orange-500 rounded"></div>
                                        <span className="text-gray-300">Non-clickable</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-2/3 h-full relative" ref={mountRef}>
                    <div ref={tooltipRef} className="absolute hidden p-2.5 bg-gray-900 bg-opacity-90 border border-gray-600 rounded-lg text-gray-200 pointer-events-none text-xs whitespace-pre z-50"></div>
                    
                    {/* Screenshot Upload Icon */}
                    {!showScreenshot && (
                        <div className="absolute top-4 right-4 z-40">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleScreenshotUpload}
                                className="hidden"
                                id="screenshot-upload-icon"
                            />
                            <label htmlFor="screenshot-upload-icon" className="cursor-pointer">
                                <div className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-lg border-2 border-gray-600 hover:border-gray-400 transition-colors flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </div>
                            </label>
                        </div>
                    )}
                    
                    {/* Screenshot Thumbnail */}
                    {showScreenshot && (
                        <div className="absolute top-4 right-4 z-40">
                            <div 
                                className="w-32 h-48 bg-gray-800 rounded-lg border-2 border-gray-600 cursor-pointer hover:border-gray-400 transition-colors overflow-hidden"
                                onClick={() => setIsScreenshotEnlarged(true)}
                                title="Click to enlarge"
                            >
                                {screenshotUrl ? (
                                    <img 
                                        src={screenshotUrl} 
                                        alt="Screenshot" 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            console.error('Failed to load image:', screenshotUrl.substring(0, 50) + '...');
                                            e.target.style.display = 'none';
                                            // Show fallback text
                                            const fallback = document.createElement('div');
                                            fallback.className = 'w-full h-full flex items-center justify-center text-gray-400 text-xs';
                                            fallback.textContent = 'Image Error';
                                            e.target.parentNode.appendChild(fallback);
                                        }}
                                        onLoad={() => console.log('Image loaded successfully')}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                        No Screenshot
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Enlarged Screenshot Modal */}
                    {isScreenshotEnlarged && (
                        <div 
                            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
                            onClick={() => setIsScreenshotEnlarged(false)}
                        >
                            <div className="relative w-full h-full flex items-center justify-center">
                                <img 
                                    src={screenshotUrl} 
                                    alt="Screenshot" 
                                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                    onClick={() => setIsScreenshotEnlarged(false)}
                                    className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white rounded-full p-3 shadow-lg"
                                    title="Close"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}

                    {isLoading && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-70 text-white p-4 rounded-lg flex items-center gap-3 z-50">
                            <div className="loader"></div>
                            Loading...
                        </div>
                    )}
                     {error && (
                        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-red-600 text-white py-2 px-4 rounded-lg z-50">
                            {error}
                        </div>
                    )}

                    {/* Navigation Controls - Only show for ZIP upload mode */}
                    {isZipUploaded && screens.length > 0 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 z-40">
                            <button
                                onClick={handlePreviousScreen}
                                disabled={currentScreenIndex === 0}
                                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white px-4 py-2 rounded-lg transition duration-300 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                Previous
                            </button>
                            <div className="bg-gray-800 text-white px-4 py-2 rounded-lg">
                                Screen {currentScreenIndex + 1} of {screens.length}
                            </div>
                            <button
                                onClick={handleNextScreen}
                                disabled={currentScreenIndex === screens.length - 1}
                                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white px-4 py-2 rounded-lg transition duration-300 flex items-center gap-2"
                            >
                                Next
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            </div>
            )}
        </>
    );
}