import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { initializeTheme } from './hooks/use-appearance';
import React, { useEffect, useState } from "react";
import { SidebarProvider } from "./components/SidebarContext";
import { PusherProvider } from "./contexts/PusherContext";
import BackgroundOrnaments from "./components/background-ornaments";
import { LoadingSpinner } from './components/loading-spinner';
import { ErrorBoundary } from './components/ErrorBoundary';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => title ? `${title} - ${appName}` : appName,
    resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),
    setup({ el, App, props }) {
        const root = createRoot(el);

        const AppWithLoading = (props: any) => {
            const [loading, setLoading] = useState(false);
            const [currentComponent, setCurrentComponent] = useState('');
            
            useEffect(() => {
                // This will run when the component mounts and when the URL changes
                const handleStart = () => setLoading(true);
                const handleFinish = () => setLoading(false);
                
                // Set up Inertia event listeners
                window.addEventListener('inertia:start', handleStart);
                window.addEventListener('inertia:finish', handleFinish);
                
                // Clean up event listeners
                return () => {
                    window.removeEventListener('inertia:start', handleStart);
                    window.removeEventListener('inertia:finish', handleFinish);
                };
            }, []);

            return (
                <ErrorBoundary>
                    <PusherProvider>
                        <SidebarProvider>
                            <div className="relative min-h-screen">
                                <BackgroundOrnaments />
                                {loading && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                                        <LoadingSpinner size="lg" className="text-primary" />
                                    </div>
                                )}
                                <App {...props} />
                            </div>
                        </SidebarProvider>
                    </PusherProvider>
                </ErrorBoundary>
            );
        };

        root.render(<AppWithLoading {...props} />);
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
