import { Suspense, lazy } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

import Index from "../pages/index";
import { PageTransition } from "./ui/PageTransition";

// Route-level code splitting: the landing page ships in the initial bundle, the
// heavier studio/cube routes are fetched on navigation.
const NotFound = lazy(() => import("../pages/NotFound"));
const PromptModel = lazy(() => import("./PromptModel"));
const ModelDashboard = lazy(() => import("./ModelDashboard"));
const Services = lazy(() => import("../pages/Services"));
const CubePage = lazy(() => import("../pages/CubePage"));
const DocsTemplate = lazy(() => import("../pages/DocsTemplate"));

/** Content routes that all render the same documentation shell. */
const DOC_ROUTES = [
    "/api-docs",
    "/changelog",
    "/documentation",
    "/blog",
    "/community",
    "/support",
    "/status",
] as const;

const RouteFallback = () => (
    <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
);

export const AnimatedRoutes = () => {
    const location = useLocation();

    return (
        <AnimatePresence mode="wait">
            <Suspense fallback={<RouteFallback />}>
                <Routes location={location} key={location.pathname}>
                    <Route
                        path="/"
                        element={
                            <PageTransition>
                                <Index />
                            </PageTransition>
                        }
                    />
                    <Route
                        path="/dashboard"
                        element={
                            <PageTransition>
                                <ModelDashboard />
                            </PageTransition>
                        }
                    />
                    <Route
                        path="/generate"
                        element={
                            <PageTransition>
                                <PromptModel />
                            </PageTransition>
                        }
                    />
                    <Route
                        path="/services"
                        element={
                            <PageTransition>
                                <Services />
                            </PageTransition>
                        }
                    />
                    <Route
                        path="/cube/:id"
                        element={
                            <PageTransition>
                                <CubePage />
                            </PageTransition>
                        }
                    />

                    {/* Dynamic Content Routes mapping to the Docs Template */}
                    {DOC_ROUTES.map((path) => (
                        <Route
                            key={path}
                            path={path}
                            element={
                                <PageTransition>
                                    <DocsTemplate />
                                </PageTransition>
                            }
                        />
                    ))}

                    <Route
                        path="*"
                        element={
                            <PageTransition>
                                <NotFound />
                            </PageTransition>
                        }
                    />
                </Routes>
            </Suspense>
        </AnimatePresence>
    );
};
