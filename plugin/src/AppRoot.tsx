import React, { useEffect } from 'react';

export const AppRoot: React.FC = () => {
  const isEmbedded = typeof window !== 'undefined' && !!(window as any).mdp;

  useEffect(() => {
    if (isEmbedded) return;

    // Inject Tailwind CSS via CDN for the mockup
    const script = document.createElement('script');
    script.src = 'https://cdn.tailwindcss.com?plugins=forms,container-queries';
    script.async = true;
    
    // Config script
    const configScript = document.createElement('script');
    configScript.id = 'tailwind-config';
    configScript.innerHTML = `
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
              "surface-container-lowest": "#000000",
              "error-container": "#7f2737",
              "primary-dim": "#b9b7c2",
              "tertiary-dim": "#c9d1ef",
              "primary": "#c7c5d0",
              "on-secondary-fixed-variant": "#5c5b5f",
              "primary-fixed-dim": "#d5d3de",
              "on-error": "#490013",
              "secondary-fixed-dim": "#d7d3d8",
              "primary-container": "#46464f",
              "surface-variant": "#262528",
              "surface-container-highest": "#262528",
              "secondary-dim": "#9f9da1",
              "on-primary-fixed-variant": "#5b5a64",
              "error-dim": "#b95463",
              "outline-variant": "#48474a",
              "tertiary-fixed-dim": "#c9d1ef",
              "surface-tint": "#c7c5d0",
              "surface": "#0e0e0f",
              "surface-bright": "#2c2c2f",
              "surface-container-high": "#201f21",
              "on-tertiary-fixed": "#353d55",
              "on-surface": "#e8e4e8",
              "surface-container": "#1a191b",
              "surface-dim": "#0e0e0f",
              "primary-fixed": "#e3e1ec",
              "error": "#ec7c8a",
              "on-secondary-container": "#c1bec2",
              "on-secondary-fixed": "#403f42",
              "surface-container-low": "#141314",
              "on-tertiary": "#505871",
              "on-surface-variant": "#adaaad",
              "on-secondary": "#202023",
              "on-primary": "#403f48",
              "on-primary-container": "#d1cfda",
              "inverse-surface": "#fcf8f9",
              "on-error-container": "#ff97a3",
              "tertiary": "#eaedff",
              "on-primary-fixed": "#3f3e47",
              "tertiary-fixed": "#d7dffe",
              "inverse-primary": "#5f5e68",
              "background": "#0e0e0f",
              "inverse-on-surface": "#565556",
              "secondary": "#9f9da1",
              "on-background": "#e8e4e8",
              "secondary-fixed": "#e5e1e6",
              "outline": "#767578",
              "secondary-container": "#3c3b3e",
              "on-tertiary-fixed-variant": "#515973",
              "on-tertiary-container": "#474f69",
              "tertiary-container": "#d7dffe"
            },
            "borderRadius": {
              "DEFAULT": "0.125rem",
              "lg": "0.25rem",
              "xl": "0.5rem",
              "full": "0.75rem"
            },
            "spacing": {
              "stack_gap_md": "16px",
              "sidebar_width": "240px",
              "header_height": "56px",
              "container_padding": "24px",
              "stack_gap_sm": "8px",
              "gutter": "16px",
              "sidebar_collapsed": "64px"
            },
            "fontFamily": {
              "body-md": ["Inter"],
              "label-caps": ["JetBrains Mono"],
              "display-lg": ["Inter"],
              "title-sm": ["Inter"],
              "headline-md": ["Inter"],
              "mono-code": ["JetBrains Mono"],
              "body-sm": ["Inter"]
            },
            "fontSize": {
              "body-md": ["14px", {"lineHeight": "22px", "fontWeight": "400"}],
              "label-caps": ["11px", {"lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "700"}],
              "display-lg": ["32px", {"lineHeight": "40px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
              "title-sm": ["18px", {"lineHeight": "24px", "fontWeight": "600"}],
              "headline-md": ["24px", {"lineHeight": "32px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
              "mono-code": ["13px", {"lineHeight": "20px", "fontWeight": "400"}],
              "body-sm": ["13px", {"lineHeight": "20px", "fontWeight": "400"}]
            }
          }
        }
      }
    `;

    document.head.appendChild(configScript);
    document.head.appendChild(script);

    // Add font and icon links
    const fontLinks = [
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap',
      'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
    ];
    
    fontLinks.forEach(href => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    });

    const style = document.createElement('style');
    style.innerHTML = `
      .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      }
      .stage-canvas {
          margin-left: 240px;
          margin-top: 56px;
          min-height: calc(100vh - 56px - 32px);
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(script);
      document.head.removeChild(configScript);
      document.head.removeChild(style);
    };
  }, [isEmbedded]);

  if (isEmbedded) {
    return (
      <div className="font-body-md text-body-md bg-transparent text-[#e8e4e8] w-full h-full min-h-screen">
        <main className="p-0">
          <div className="mb-8 flex justify-between items-end">
            <div>
              <h2 className="font-display-lg text-display-lg mb-1">Pipeline Overview</h2>
              <p className="text-on-surface-variant">Real-time automation health and content generation metrics.</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded border border-outline-variant">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="font-label-caps text-label-caps text-on-surface">System Health: Optimal</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-gutter mb-gutter">
            <div className="col-span-12 md:col-span-3 bg-surface-container p-6 rounded-xl border border-outline-variant hover:border-primary transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-surface-container-highest rounded">
                  <span className="material-symbols-outlined text-primary">hub</span>
                </div>
                <span className="font-label-caps text-label-caps text-emerald-400">+12%</span>
              </div>
              <p className="text-on-surface-variant font-label-caps uppercase mb-1">Active Sources</p>
              <p className="text-[36px] font-bold leading-none">1,284</p>
            </div>
            <div className="col-span-12 md:col-span-3 bg-surface-container p-6 rounded-xl border border-outline-variant hover:border-primary transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-surface-container-highest rounded">
                  <span className="material-symbols-outlined text-primary">auto_fix</span>
                </div>
                <span className="font-label-caps text-label-caps text-primary">Target: 500</span>
              </div>
              <p className="text-on-surface-variant font-label-caps uppercase mb-1">Drafts Generated Today</p>
              <p className="text-[36px] font-bold leading-none">412</p>
            </div>
            <div className="col-span-12 md:col-span-6 bg-surface-container p-6 rounded-xl border border-outline-variant relative overflow-hidden group">
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-on-surface-variant font-label-caps uppercase">AI Engine Status</p>
                  <span className="font-label-caps text-label-caps text-primary">Processing: 98.4% Efficiency</span>
                </div>
                <div className="flex-1 flex items-end gap-1 pb-2">
                  <div className="w-full bg-surface-container-highest h-24 rounded-sm flex items-end gap-0.5">
                    <div className="flex-1 bg-primary h-[95%]"></div>
                  </div>
                </div>
                <p className="text-body-sm text-on-surface-variant italic">Engine "Orion-4" currently handling high-priority crawls.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-gutter">
            <div className="col-span-12 lg:col-span-8 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-title-sm text-title-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                  Needs Review
                  <span className="ml-2 bg-error-container text-on-error-container px-2 py-0.5 rounded-full text-[10px] font-bold">14</span>
                </h3>
                <button className="text-primary font-label-caps text-label-caps hover:underline">Clear All</button>
              </div>
              
              <div className="space-y-3">
                <div className="bg-surface-container-high p-4 rounded-lg border border-outline-variant flex gap-4 group hover:bg-surface-bright transition-all">
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <span className="font-label-caps text-label-caps text-primary px-2 py-0.5 bg-primary-container/20 rounded">AI GENERATED</span>
                      <span className="text-body-sm text-on-surface-variant">2m ago</span>
                    </div>
                    <h4 className="font-title-sm text-on-surface mt-1">The Future of Decentralized Content Aggregation</h4>
                    <p className="text-body-sm text-on-surface-variant line-clamp-1 mt-0.5">Automated draft for X and LinkedIn. Confidence score: 84%.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 space-y-4">
              <h3 className="font-title-sm text-title-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">dynamic_feed</span>
                Recent Auto-Crawls
              </h3>
              <div className="bg-surface-container rounded-xl border border-outline-variant overflow-hidden">
                <div className="divide-y divide-outline-variant">
                  <div className="p-4 hover:bg-surface-variant transition-colors cursor-pointer group">
                    <div className="flex justify-between mb-1">
                      <span className="font-mono-code text-mono-code text-on-surface">t.me/tech_alpha</span>
                      <span className="font-label-caps text-label-caps text-emerald-400">SUCCESS</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="font-body-md text-body-md bg-[#0e0e0f] text-[#e8e4e8] min-h-screen">
      <aside className="w-sidebar_width h-full fixed left-0 top-0 bg-surface-container-low dark:bg-surface-container-low border-r border-outline-variant flex flex-col p-stack_gap_md z-50">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-on-primary">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-primary dark:text-primary leading-tight">MDP</h1>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label-caps">Content Orchestrator</p>
          </div>
        </div>
        <button className="mb-8 w-full py-3 px-4 bg-primary text-on-primary font-title-sm text-title-sm rounded-lg flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all">
          <span className="material-symbols-outlined">add</span> Compose
        </button>
        <nav className="flex-1 space-y-1">
          <div className="px-2 py-2 bg-primary-container text-on-primary-container rounded-full flex items-center gap-3 cursor-pointer active:scale-95 transition-colors">
            <span className="material-symbols-outlined ml-2">public</span>
            <span>Facebook</span>
          </div>
        </nav>
      </aside>
      
      <header className="fixed top-0 right-0 h-header_height w-[calc(100%-theme(spacing.sidebar_width))] bg-surface dark:bg-surface border-b border-outline-variant flex justify-between items-center px-container_padding z-40">
        <div className="flex items-center gap-8">
          <nav className="flex gap-6">
            <a className="text-primary font-bold border-b-2 border-primary pb-1 font-title-sm text-title-sm transition-all duration-200" href="#">Dashboard</a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="bg-primary text-on-primary px-4 py-1.5 rounded text-body-sm font-semibold hover:opacity-90 transition-all">Publish Now</button>
        </div>
      </header>
      
      <main className="stage-canvas p-container_padding">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="font-display-lg text-display-lg mb-1">Pipeline Overview</h2>
            <p className="text-on-surface-variant">Real-time automation health and content generation metrics.</p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded border border-outline-variant">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="font-label-caps text-label-caps text-on-surface">System Health: Optimal</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter mb-gutter">
          <div className="col-span-12 md:col-span-3 bg-surface-container p-6 rounded-xl border border-outline-variant hover:border-primary transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-surface-container-highest rounded">
                <span className="material-symbols-outlined text-primary">hub</span>
              </div>
              <span className="font-label-caps text-label-caps text-emerald-400">+12%</span>
            </div>
            <p className="text-on-surface-variant font-label-caps uppercase mb-1">Active Sources</p>
            <p className="text-[36px] font-bold leading-none">1,284</p>
          </div>
          <div className="col-span-12 md:col-span-3 bg-surface-container p-6 rounded-xl border border-outline-variant hover:border-primary transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-surface-container-highest rounded">
                <span className="material-symbols-outlined text-primary">auto_fix</span>
              </div>
              <span className="font-label-caps text-label-caps text-primary">Target: 500</span>
            </div>
            <p className="text-on-surface-variant font-label-caps uppercase mb-1">Drafts Generated Today</p>
            <p className="text-[36px] font-bold leading-none">412</p>
          </div>
          <div className="col-span-12 md:col-span-6 bg-surface-container p-6 rounded-xl border border-outline-variant relative overflow-hidden group">
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <p className="text-on-surface-variant font-label-caps uppercase">AI Engine Status</p>
                <span className="font-label-caps text-label-caps text-primary">Processing: 98.4% Efficiency</span>
              </div>
              <div className="flex-1 flex items-end gap-1 pb-2">
                <div className="w-full bg-surface-container-highest h-24 rounded-sm flex items-end gap-0.5">
                  <div className="flex-1 bg-primary h-[95%]"></div>
                </div>
              </div>
              <p className="text-body-sm text-on-surface-variant italic">Engine "Orion-4" currently handling high-priority crawls.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter">
          <div className="col-span-12 lg:col-span-8 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-title-sm text-title-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                Needs Review
                <span className="ml-2 bg-error-container text-on-error-container px-2 py-0.5 rounded-full text-[10px] font-bold">14</span>
              </h3>
              <button className="text-primary font-label-caps text-label-caps hover:underline">Clear All</button>
            </div>
            
            <div className="space-y-3">
              <div className="bg-surface-container-high p-4 rounded-lg border border-outline-variant flex gap-4 group hover:bg-surface-bright transition-all">
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <span className="font-label-caps text-label-caps text-primary px-2 py-0.5 bg-primary-container/20 rounded">AI GENERATED</span>
                    <span className="text-body-sm text-on-surface-variant">2m ago</span>
                  </div>
                  <h4 className="font-title-sm text-on-surface mt-1">The Future of Decentralized Content Aggregation</h4>
                  <p className="text-body-sm text-on-surface-variant line-clamp-1 mt-0.5">Automated draft for X and LinkedIn. Confidence score: 84%.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-4">
            <h3 className="font-title-sm text-title-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">dynamic_feed</span>
              Recent Auto-Crawls
            </h3>
            <div className="bg-surface-container rounded-xl border border-outline-variant overflow-hidden">
              <div className="divide-y divide-outline-variant">
                <div className="p-4 hover:bg-surface-variant transition-colors cursor-pointer group">
                  <div className="flex justify-between mb-1">
                    <span className="font-mono-code text-mono-code text-on-surface">t.me/tech_alpha</span>
                    <span className="font-label-caps text-label-caps text-emerald-400">SUCCESS</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AppRoot;
