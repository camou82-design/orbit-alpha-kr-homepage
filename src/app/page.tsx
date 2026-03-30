"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { BlogAutomationSection } from '@/components/blog/BlogAutomationTool';
import { ContactForm } from '@/components/ContactForm';

export default function HomePage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [jjContactOpen, setJjContactOpen] = useState(false);
  const [insights, setInsights] = useState<Array<{ title: string; summary: string; meta: string; href: string }> | null>(
    null,
  );
  const [insightsStatus, setInsightsStatus] = useState<"loading" | "rss" | "fallback">("loading");
  const insightsBlogHome = "https://blog.orbitalpha.kr";
  // Display-layer only: keep sections in code, hide if not needed.
  const SHOW_PLATFORM_SECTION = false;

  // Prevent browser scroll restoration and always start at top
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fallback = [
      {
        title: "금리 변화가 현장 비용에 먼저 찍히는 지점",
        summary: "조달·인건비·대금 결제 흐름에서 먼저 체감되는 포인트를 짧게 정리합니다.",
        meta: "브리핑 · 2026.03",
        href: "https://blog.orbitalpha.kr",
      },
      {
        title: "환율과 원자재: 숫자보다 '타이밍'이 중요한 이유",
        summary: "가격 자체보다 발주/납기 타이밍이 리스크가 되는 구조를 사례로 풀어봅니다.",
        meta: "인사이트 · 2026.03",
        href: "https://blog.orbitalpha.kr",
      },
      {
        title: "자동화의 출발점은 대시보드가 아니라 체크리스트",
        summary: "작게 시작해도 효과가 나는 운영 자동화의 최소 단위를 제안합니다.",
        meta: "워크플로우 · 2026.03",
        href: "https://blog.orbitalpha.kr",
      },
    ];

    (async () => {
      try {
        const res = await fetch("/api/financial-insights", { method: "GET" });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok || !Array.isArray(json?.items) || json.items.length === 0) {
          throw new Error(json?.error ?? "RSS 로딩 실패");
        }
        const items = json.items
          .slice(0, 3)
          .map((it: any) => ({
            title: String(it.title ?? ""),
            summary: String(it.summary ?? ""),
            meta: String(it.meta ?? ""),
            href: String(it.href ?? ""),
          }))
          .filter((it: any) => it.title && it.href);
        if (!items.length) throw new Error("RSS 항목이 비어 있습니다.");
        if (!cancelled) {
          setInsights(items);
          setInsightsStatus("rss");
        }
      } catch {
        if (!cancelled) {
          setInsights(fallback);
          setInsightsStatus("fallback");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    let scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
      renderer: THREE.WebGLRenderer,
      earth: THREE.Mesh,
      satPoints: THREE.Points,
      constellationLines: THREE.LineSegments,
      swarmPoints: THREE.Points;

    const container = canvasRef.current;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const ACTIVE_SAT_COUNT = 350;
    const TOTAL_SAT_COUNT = 15000;
    // 모바일에서만(좁은 화면에서만) 지구/네트워크가 너무 커 보이는 문제 완화
    const isMobile = window.innerWidth < 640;
    const MAX_CONNECT_DIST = isMobile ? 42 : 48;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    // 모바일에서 카메라를 더 뒤로 두어(=확대 감소) + 전체 모델을 스케일 축소
    camera.position.z = isMobile ? 235 : 350;
    camera.position.y = isMobile ? 10 : 35;
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const loader = new THREE.TextureLoader();
    // 전체 모델을 모바일에서 비례 축소(기존 대비 추가로 10~15% 정도 축소)
    const modelScale = isMobile ? 0.72 : 1;
    const modelGroup = new THREE.Group();
    modelGroup.scale.setScalar(modelScale);
    scene.add(modelGroup);

    const earthGeo = new THREE.SphereGeometry(80, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      map: loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'),
      bumpMap: loader.load('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg'),
      bumpScale: 1.2,
      specular: new THREE.Color('#333'),
      shininess: 20
    });
    earth = new THREE.Mesh(earthGeo, earthMat);
    modelGroup.add(earth);

    const atmoGeo = new THREE.SphereGeometry(82, 64, 64);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x00F2FF,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide
    });
    const atmo = new THREE.Mesh(atmoGeo, atmoMat);
    modelGroup.add(atmo);

    scene.add(new THREE.AmbientLight(0xFFFFFF, 0.5));
    const sun = new THREE.DirectionalLight(0xFFFFFF, 1.8);
    sun.position.set(100, 50, 100);
    scene.add(sun);

    const swarmPos = [];
    for (let i = 0; i < TOTAL_SAT_COUNT; i++) {
      const r = 90 + Math.random() * 100;
      const phi = Math.acos(-1 + (2 * i) / TOTAL_SAT_COUNT);
      const theta = Math.sqrt(TOTAL_SAT_COUNT * Math.PI) * phi;
      swarmPos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
    const swarmGeo = new THREE.BufferGeometry();
    swarmGeo.setAttribute('position', new THREE.Float32BufferAttribute(swarmPos, 3));
    const swarmMat = new THREE.PointsMaterial({
      color: 0xFFFFFF,
      size: 0.6,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending
    });
    swarmPoints = new THREE.Points(swarmGeo, swarmMat);
    // 포인트 사이즈도 모바일에서 조금 더 컴팩트하게
    if (isMobile) swarmPoints.material.size = 0.4;
    modelGroup.add(swarmPoints);

    const activePos = [];
    for (let i = 0; i < ACTIVE_SAT_COUNT; i++) {
      const r = 105;
      const phi = Math.acos(-1 + (2 * i) / ACTIVE_SAT_COUNT);
      const theta = Math.sqrt(ACTIVE_SAT_COUNT * Math.PI) * phi;
      activePos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
    const satGeo = new THREE.BufferGeometry();
    satGeo.setAttribute('position', new THREE.Float32BufferAttribute(activePos, 3));
    const satMat = new THREE.PointsMaterial({
      color: 0xFFD700,
      size: 2.5,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });
    satPoints = new THREE.Points(satGeo, satMat);
    if (isMobile) satPoints.material.size = 1.9;
    modelGroup.add(satPoints);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xFFD700,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending
    });
    const lineGeo = new THREE.BufferGeometry();
    const lineIndices = [];
    const posArray = satGeo.attributes.position.array as Float32Array;

    for (let i = 0; i < ACTIVE_SAT_COUNT; i++) {
      for (let j = i + 1; j < ACTIVE_SAT_COUNT; j++) {
        const dx = posArray[i * 3] - posArray[j * 3];
        const dy = posArray[i * 3 + 1] - posArray[j * 3 + 1];
        const dz = posArray[i * 3 + 2] - posArray[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < MAX_CONNECT_DIST) {
          lineIndices.push(i, j);
        }
      }
    }
    lineGeo.setAttribute('position', satGeo.attributes.position);
    lineGeo.setIndex(lineIndices);
    constellationLines = new THREE.LineSegments(lineGeo, lineMat);
    modelGroup.add(constellationLines);

    let animationId: number;
    const animateOrbit = () => {
      animationId = requestAnimationFrame(animateOrbit);
      const time = Date.now() * 0.0005;

      earth.rotation.y += 0.001;
      swarmPoints.rotation.y += 0.0002;
      satPoints.rotation.y += 0.0006;
      constellationLines.rotation.y = satPoints.rotation.y;

      // @ts-ignore
      constellationLines.material.opacity = 0.2 + Math.sin(time * 3) * 0.15;

      const srsEl = document.getElementById('live-srs');
      const linkEl = document.getElementById('active-links-val');
      if (srsEl) srsEl.textContent = (82.1 + Math.sin(time) * 0.3).toFixed(1);
      if (linkEl) linkEl.textContent = Math.floor(4200 + Math.random() * 100).toLocaleString();

      renderer.render(scene, camera);
    };

    animateOrbit();

    const handleScroll = () => {
      const navbar = document.getElementById('navbar');
      if (navbar) {
        if (window.scrollY > 50) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', handleScroll);

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      scene.clear();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#030509] text-[#F8FAFC] font-sans selection:bg-[#00F2FF]/30 overflow-x-hidden">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&family=Inter:wght@300;400;700&display=swap');
        
        :root {
          --cyber: #00F2FF;
          --gold: #FFD700;
        }

        body {
          background: radial-gradient(circle at 10% 10%, rgba(0, 242, 255, 0.08), transparent 40%),
                      radial-gradient(circle at 90% 90%, rgba(255, 215, 0, 0.08), transparent 40%),
                      linear-gradient(180deg, #030509 0%, #0A0F1E 100%);
          background-attachment: fixed;
          margin: 0;
        }

        @media (max-width: 1023px) {
          html {
            scroll-snap-type: y proximity;
            scroll-padding-top: 70px;
          }

          .mobile-fullscreen-panel {
            scroll-snap-align: start;
          }

          .mobile-hero-panel {
            min-height: calc(100svh - 70px);
            justify-content: center;
          }

          .mobile-dashboard-panel {
            min-height: 750px;
            height: 750px !important;
          }

          #solutions,
          #model,
          #platform,
          #contact {
            min-height: 100svh;
            scroll-snap-align: start;
          }
        }

        /* 모바일(더 좁은 화면)에서만 지구/네트워크 비주얼이 답답하지 않게 축소 */
        @media (max-width: 639px) {
          .mobile-dashboard-panel {
            min-height: 620px;
            height: 620px !important;
          }

          /* 하단 스탯 패널(총 위성 / 스타링크)을 모바일에서 더 컴팩트하게 */
          .mobile-dashboard-panel .absolute.bottom-10.left-4.right-4 {
            transform: scale(0.82);
            transform-origin: bottom center;
          }
        }

        .hero-card {
          background: rgba(13, 22, 45, 0.6);
          backdrop-filter: blur(32px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 32px;
          padding: 20px 18px;
          position: relative;
          overflow: hidden;
          min-height: calc(100svh - 70px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          box-shadow: 0 50px 120px -30px rgba(0, 0, 0, 0.7);
        }

        @media (min-width: 1024px) {
          .hero-card {
            padding: 56px 64px;
            min-height: unset;
            height: 100%;
            justify-content: center;
          }
        }

        .dashboard-container {
          background: #020408;
          border-radius: 32px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          height: 100svh !important;
          position: relative;
          overflow: hidden;
          box-shadow: 0 50px 120px -30px rgba(0, 0, 0, 0.7), 0 0 50px rgba(0, 242, 255, 0.05);
        }

        @media (min-width: 1024px) {
          .dashboard-container {
            height: 100% !important;
          }
        }

        .glass-card {
          background: rgba(13, 22, 45, 0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 32px;
          transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
        }

        .glass-card:hover {
          background: rgba(18, 28, 55, 0.8);
          border-color: rgba(0, 242, 255, 0.3);
          transform: translateY(-8px);
        }

        .step-box {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          position: relative;
          padding: 32px;
          transition: all 0.4s ease;
        }

        .step-box:hover {
          border-color: var(--cyber);
          transform: translateY(-5px);
        }

        .step-num {
          font-size: 56px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.05);
          position: absolute;
          top: 10px;
          right: 20px;
          font-family: 'Outfit';
        }

        .btn-gold {
          background: linear-gradient(135deg, var(--gold), #FFB800);
          color: #000 !important;
          box-shadow: 0 0 24px rgba(255, 215, 0, 0.3);
          font-weight: 700;
        }

        .btn-gold:hover {
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.5);
          transform: translateY(-3px);
        }

        .btn-cyber-outline {
          border: 1.5px solid var(--cyber);
          color: var(--cyber) !important;
          background: rgba(0, 242, 255, 0.08);
          font-weight: 700;
        }

        .nav-link {
          font-size: 13px;
          font-weight: 800;
          color: #94A3B8;
          transition: all 0.4s ease;
          letter-spacing: 1.2px;
        }

        .nav-link:hover {
          color: var(--cyber);
        }

        .purse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--cyber);
          box-shadow: 0 0 10px var(--cyber);
          animation: blink 2s infinite;
          display: inline-block;
        }

        @keyframes blink {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        .tag-status {
          font-size: 11px;
          color: #94A3B8;
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 6px 16px;
          border-radius: 99px;
          background: rgba(255, 255, 255, 0.05);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 800;
        }
      `}</style>

      {/* Navigation */}
      <header id="navbar" className="fixed top-0 left-0 right-0 z-[100] backdrop-blur-xl bg-[#030509]/50 border-b border-white/5 transition-all duration-700">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 flex items-center justify-between h-[70px] lg:h-[100px]">
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="font-outfit font-black text-[22px] lg:text-[28px] tracking-tight flex items-center cursor-pointer" onClick={() => window.location.reload()}>
              <span className="text-[#FFD700]">ORBIT</span>
              <span className="text-white/20 mx-2.5">/</span>
              <span className="text-[#00F2FF]">ALPHA</span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-14">
            {[
              { label: 'OVERVIEW', href: '#overview' },
              { label: 'OPERATIONS', href: '#model' },
              { label: 'TOOLS', href: '/tools' },
              { label: 'INSIGHTS', href: '#financial-insights' },
              { label: 'CONTACT', href: '#contact' },
            ].map((item) => (
              <a key={item.label} href={item.href} className="nav-link">{item.label}</a>
            ))}
          </nav>

          <div className="flex items-center gap-2 lg:gap-5">
            <button
              onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}
              className="hidden sm:inline-flex px-4 lg:px-8 py-2.5 lg:py-3.5 rounded-xl btn-cyber-outline font-outfit text-[11px] lg:text-[13px] tracking-wide transition-all cursor-pointer">
              협업 문의
            </button>
            <button
              onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-3 sm:px-4 lg:px-8 py-2 sm:py-2.5 lg:py-3.5 rounded-xl btn-gold font-outfit text-[10px] sm:text-[11px] lg:text-[13px] tracking-wide transition-all shadow-xl whitespace-nowrap cursor-pointer">
              문의하기
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* HERO SECTION - SCALE REFINED */}
        <section id="overview" className="relative flex items-start lg:items-center pt-[70px] sm:pt-[100px] lg:pt-36 pb-0 lg:pb-28">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10 w-full">
            <div className="grid lg:grid-cols-2 gap-0 sm:gap-4 lg:gap-16 items-stretch lg:h-[600px]">

              {/* Left Column: Text Content Card */}
              <div className="hero-card mobile-fullscreen-panel mobile-hero-panel">
                <div className="flex items-center gap-3.5 text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-3 lg:mb-10 font-outfit">
                  <span className="purse-dot" /> Field Operations Suite
                </div>

                <h1 className="text-[28px] lg:text-[60px] font-black mb-4 lg:mb-10 leading-[1.15] font-outfit text-white break-keep" style={{ wordBreak: 'keep-all' }}>
                  현장 데이터를 기반으로 <br className="hidden lg:block" />
                  <span className="text-[#FFD700] drop-shadow-[0_0_25px_rgba(255,215,0,0.6)]">운영과 리스크</span>를 <br className="hidden lg:block" />
                  관리합니다
                </h1>

                <p className="text-[14px] lg:text-[18px] text-[#94A3B8] leading-[1.7] mb-5 lg:mb-12 max-w-[540px] font-medium">
                  <b>OrbitAlpha</b>는 현장에서 쌓이는 작업·인력·자재 흐름 데이터를 한 화면에서 정리하고, 이상 신호와 운영 리스크를 빠르게 점검할 수 있는 실무 도구를 제공합니다.
                </p>

                <div className="flex flex-wrap gap-3 lg:gap-6 mb-4 lg:mb-12">
                  <button
                    onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}
                    className="flex-1 lg:flex-none px-6 lg:px-10 py-3 lg:py-5 rounded-xl btn-gold text-[13px] lg:text-[15px] transition-all text-center">
                    운영 문의
                  </button>
                  <button
                    onClick={() => document.getElementById('model')?.scrollIntoView({ behavior: 'smooth' })}
                    className="flex-1 lg:flex-none px-6 lg:px-10 py-3 lg:py-5 rounded-xl bg-[#121C37] border border-white/15 text-white text-[13px] lg:text-[15px] font-black hover:bg-[#1a284e] transition-all text-center">
                    자세히 보기
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 lg:gap-6">
                  <span className="tag-status">Field Workflow</span>
                  <span className="tag-status">Risk Checklist</span>
                </div>
              </div>

              {/* Right Column: Globe Dashboard Card */}
              <div className="dashboard-container mobile-fullscreen-panel mobile-dashboard-panel lg:h-full">
                <div ref={canvasRef} className="absolute inset-0" />

                <div className="relative z-10 p-4 lg:p-10 flex flex-col h-full pointer-events-none">
                  {/* SRS Card - Top Left */}
                  <div className="absolute top-6 left-6 bg-black/70 backdrop-blur-2xl p-3 lg:p-6 rounded-[20px] border border-white/10 shadow-2xl z-20">
                    <span className="text-[7px] lg:text-[10px] text-[#94A3B8] tracking-[0.3em] block mb-1 lg:mb-2 font-black uppercase">SRS · Risk Score</span>
                    <strong id="live-srs" className="text-xl lg:text-5xl font-black text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.5)] italic tracking-tighter">82.4</strong>
                  </div>

                  {/* Orbital Live Dot - Top Right */}
                  <div className="absolute top-6 right-6 px-3 lg:px-5 py-1.5 lg:py-2.2 rounded-full bg-[#00F2FF]/20 border border-[#00F2FF]/50 text-[#00F2FF] text-[8px] lg:text-[10px] font-black tracking-[0.25em] flex items-center gap-2 lg:gap-3 backdrop-blur-lg shadow-lg z-20">
                    <span className="pulse-dot" /> ORBITAL LIVE
                  </div>

                  {/* Bottom Row Statistics - Absolute Positioning for "Solid" feel */}
                  <div className="absolute bottom-10 left-4 right-4 grid grid-cols-2 gap-3 lg:gap-5 text-center">
                    <div className="p-3 lg:p-6 rounded-[22px] bg-black/85 backdrop-blur-2xl border border-white/15 shadow-2xl flex flex-col justify-center">
                      <span className="text-[7px] lg:text-[10px] text-[#94A3B8] block mb-0.5 lg:mb-2 uppercase font-black tracking-[0.1em]">Total Satellites</span>
                      <div id="total-sat-val" className="text-[12px] lg:text-xl font-black text-[#00F2FF] tracking-tight">15,000</div>
                    </div>
                    <div className="p-3 lg:p-6 rounded-[22px] bg-black/85 backdrop-blur-2xl border border-white/15 shadow-2xl border-l-[#FFD700]/40 flex flex-col justify-center">
                      <span className="text-[7px] lg:text-[10px] text-[#FFD700] block mb-0.5 lg:mb-2 uppercase font-black tracking-[0.1em]">Starlink Links</span>
                      <div id="active-links-val" className="text-[12px] lg:text-xl font-black text-[#FFD700] tracking-tight">4,281</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* SOLUTIONS SECTION */}
        <section id="solutions" className="py-16 lg:py-32">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
            <div className="text-center mb-12 lg:mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">Operations</div>
              <h2 className="text-[28px] lg:text-[42px] font-black font-outfit mb-6">현장 운영을 ‘한 화면’으로 정리합니다</h2>
              <p className="text-[#94A3B8] max-w-[760px] mx-auto text-[16px] lg:text-[18px]">
                작업·인력·자재 흐름을 정돈하고, 운영 리스크를 체크리스트처럼 빠르게 점검할 수 있게 만듭니다.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="glass-card">
                <div className="text-[#FFD700] font-black mb-6 uppercase tracking-widest">[ Reality ]</div>
                <h3 className="text-[24px] font-bold mb-6 font-outfit">현장 운영 데이터는 흩어져 있습니다</h3>
                <p className="text-[#94A3B8] leading-8 text-[16px]">
                  • 작업·투입·정리 기록이 사람/채널별로 분산<br />
                  • 진행 상황을 “감”으로 공유해 누락이 생김<br />
                  • 문제는 늦게 발견되어 일정·비용으로 이어짐
                </p>
              </div>
              <div className="glass-card relative overflow-hidden shadow-[0_0_55px_rgba(0,242,255,0.08)] border-[#00F2FF]/20 bg-[radial-gradient(circle_at_top_right,rgba(0,242,255,0.14),transparent_36%),linear-gradient(135deg,rgba(18,28,55,0.96),rgba(8,13,28,0.96))]">
                <div className="absolute inset-0 pointer-events-none opacity-40 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:26px_26px]" />
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#00F2FF]/35 to-transparent pointer-events-none" />

                <div className="relative z-10 flex h-full flex-col justify-between gap-7">
                  <div>
                    <h3 className="text-[30px] leading-[1.18] font-black mb-4 font-outfit text-white">
                      현장 공구·자재 전문관
                    </h3>
                    <p className="text-[#CBD5E1] leading-7 text-[16px] font-medium max-w-[520px]">
                      오늘 필요한 현장 상황부터 업종 카테고리, 추천 기준 품목까지 한 흐름으로 보여드립니다.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {['건설 기본용품', '형틀', '전기', '설비', '해체정리', '시스템 비계'].map((item, index) => (
                      <span
                        key={item}
                        className={`rounded-full border px-3.5 py-2 text-[12px] font-black tracking-[0.06em] ${
                          index % 3 === 1
                            ? 'border-[#FFD700]/25 bg-[#1a1406]/70 text-[#FFD700]'
                            : 'border-[#00F2FF]/20 bg-[#0d1729]/75 text-[#BDF8FF]'
                        }`}
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1">
                    <div className="px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-white/70 text-[14px] font-black tracking-wide">
                      점검 중
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RISK MODEL SECTION */}
        <section id="model" className="py-16 lg:py-32 bg-white/5">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
            <div className="text-center mb-12 lg:mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">Field Management</div>
              <h2 className="text-[28px] lg:text-[42px] font-black font-outfit mb-6">현장 운영 관리</h2>
              <p className="text-[#94A3B8] max-w-[700px] mx-auto text-[16px] lg:text-[18px]">소규모 건설업체의 인력, 노무비, 작업 흐름을 한눈에 관리합니다.</p>
            </div>

            <div className="grid lg:grid-cols-4 gap-6">
              <div
                role="link"
                tabIndex={0}
                onClick={() => {
                  window.location.href = '/jj';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') window.location.href = '/jj';
                }}
                className="glass-card flex flex-col items-center text-center py-12 px-8 cursor-pointer group block"
              >
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#94A3B8] mb-4">
                  OPERATION SUPPORT
                </div>

                <h3 className="text-[22px] font-extrabold mb-3 font-outfit text-[#00F2FF] tracking-tight group-hover:text-[#FFD700] transition-colors">
                  JJ형틀해체정리
                </h3>
                <p className="text-[#94A3B8] text-[14px] leading-relaxed mb-8 font-medium">
                  형틀 해체·정리 작업 운영 지원 시스템
                </p>

                <div className="w-full flex flex-col items-start gap-4 mb-10">
                  <div className="flex items-start gap-3 w-full">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00F2FF] mt-2 shadow-[0_0_14px_rgba(0,242,255,0.55)]" />
                    <div className="text-[#CBD5E1] text-[15px] leading-relaxed font-medium text-left">
                      인력 투입 및 작업 흐름 운영
                    </div>
                  </div>
                  <div className="flex items-start gap-3 w-full">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFD700] mt-2 shadow-[0_0_14px_rgba(255,215,0,0.35)]" />
                    <div className="text-[#CBD5E1] text-[15px] leading-relaxed font-medium text-left">
                      자재 이동·반출·정리 지원
                    </div>
                  </div>
                  <div className="flex items-start gap-3 w-full">
                    <span className="w-2.5 h-2.5 rounded-full bg-white/70 mt-2 shadow-[0_0_12px_rgba(255,255,255,0.18)]" />
                    <div className="text-[#CBD5E1] text-[15px] leading-relaxed font-medium text-left">
                      마감 정리 및 현장 대응 추적
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-white/10 w-full flex flex-col items-center gap-4">
                  <div className="w-full flex items-center justify-between">
                  <div className="text-[11px] font-bold text-[#94A3B8] tracking-wide">
                    OrbitAlpha 운영 솔루션
                  </div>
                  <div className="px-4 py-2 rounded-xl border border-[#00F2FF]/35 bg-[#0b1526] text-[#00F2FF] text-[12px] font-black tracking-wide hover:bg-[#12203a] transition-all">
                    운영 보기
                  </div>
                  </div>

                  <div className="w-full flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                    <a
                      href="#contact"
                      className="text-[#94A3B8] text-[12px] font-bold tracking-wide hover:text-[#00F2FF] transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      문의하기
                    </a>

                    <button
                      type="button"
                      className="text-[#CBD5E1] text-[12px] font-bold tracking-wide hover:text-[#FFD700] transition-colors cursor-pointer underline decoration-white/15 hover:decoration-white/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setJjContactOpen((v) => !v);
                      }}
                    >
                      카카오 상담 또는 연락 안내
                    </button>
                  </div>

                  {jjContactOpen && (
                    <div className="w-full text-center text-[11px] text-[#CBD5E1] leading-relaxed">
                      <span className="text-[#94A3B8] font-bold">연락:</span>{' '}
                      <a
                        href="tel:01095732510"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#00F2FF] font-bold hover:text-[#FFD700] transition-colors underline decoration-white/10 hover:decoration-white/35"
                      >
                        010-9573-2510
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <div className="glass-card">
                <div className="text-3xl mb-6">⚡</div>
                <h3 className="text-[20px] font-bold mb-4 font-outfit">Shock & Recovery</h3>
                <p className="text-[#94A3B8] text-[15px] leading-relaxed">사고 발생 시의 타격과, 이후 대응을 통한 회복 탄력성을 엔진이 계산합니다.</p>
              </div>
              <div className="glass-card">
                <div className="text-3xl mb-6">🔗</div>
                <h3 className="text-[20px] font-bold mb-4 font-outfit">Supply Chain S</h3>
                <p className="text-[#94A3B8] text-[15px] leading-relaxed">공급망 전체의 리스크를 벤치마킹하고 비교 분석할 수 있는 구조를 제공합니다.</p>
              </div>
              <div className="glass-card border-white/10 bg-[#121C37]">
                <div className="text-3xl mb-6">🏠</div>
                <div className="text-[#00F2FF] text-[11px] font-bold mb-2 uppercase tracking-widest">15년 현장 경험 기반 리스크 사전 차단</div>
                <h3 className="text-[20px] font-extrabold mb-4 font-outfit text-white">전문건설업 안전 컨설팅</h3>
                <p className="text-[#94A3B8] text-[14px] leading-relaxed">
                  • 가시설 / 토공 공정 위험요소 점검<br />
                  • 개구부·추락·전도 사고 예방 컨설팅<br />
                  • 용접·화재 감시 및 중장비 작업 안전관리<br />
                  • 현장 사진 기반 리스크 분석 보고서 제공
                </p>
                <div className="mt-6 text-[11px] font-bold text-[#FFD700]/60 italic font-inter tracking-[0.05em]">Field-based Risk Intelligence for specialty contractors.</div>
              </div>
            </div>

            <BlogAutomationSection />
          </div>
        </section>

        {/* PLATFORM SECTION (kept in code, optionally hidden) */}
        {SHOW_PLATFORM_SECTION ? (
          <section id="platform" className="py-10 sm:py-20 flex justify-center overflow-hidden">
            <div className="flex gap-2 sm:gap-4 items-center px-4">
              <div className="w-[30px] sm:w-[80px] h-[2px] bg-[#00F2FF]/20 flex-shrink-0"></div>
              <div className="text-center font-outfit font-black text-white/10 text-2xl sm:text-4xl lg:text-6xl tracking-widest whitespace-nowrap">INFRASTRUCTURE</div>
              <div className="w-[30px] sm:w-[80px] h-[2px] bg-[#00F2FF]/20 flex-shrink-0"></div>
            </div>
          </section>
        ) : null}

        {/* FINANCIAL INSIGHTS SECTION */}
        <section id="financial-insights" className="py-16 lg:py-28">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
            <div className="text-center mb-10 lg:mb-14">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">FINANCIAL INSIGHTS</div>
              <h2 className="text-[28px] lg:text-[42px] font-black font-outfit mb-5">디지털 금융 자동화 연구소</h2>
              <p className="text-[#94A3B8] max-w-[760px] mx-auto text-[16px] lg:text-[18px]">
                시장 흐름과 자동화 관점에서 정리한 실전형 경제 브리핑
              </p>
              <div className="mt-4 text-[11px] font-bold tracking-[0.22em] uppercase text-white/25">
                {insightsStatus === "rss"
                  ? "RSS · LIVE"
                  : insightsStatus === "fallback"
                    ? "RSS · FALLBACK"
                    : "RSS · CHECKING"}
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {(insights ?? []).map((post) => (
                <a
                  key={post.href}
                  href={post.href}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-card group text-left block hover:border-[#00F2FF]/25"
                >
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#94A3B8] mb-4">
                    {post.meta}
                  </div>
                  <h3 className="text-[20px] font-extrabold mb-3 font-outfit text-white group-hover:text-[#00F2FF] transition-colors leading-snug">
                    {post.title}
                  </h3>
                  <p className="text-[#94A3B8] text-[14px] leading-relaxed font-medium">
                    {post.summary}
                  </p>
                  <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5">
                    <span className="text-[11px] font-bold text-[#64748B] tracking-wide">TISTORY</span>
                    <span className="text-[12px] font-black text-[#00F2FF]/90 tracking-wide group-hover:text-[#FFD700] transition-colors">
                      읽어보기 →
                    </span>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-10 lg:mt-12 flex justify-center">
              <a
                href={insightsBlogHome}
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 rounded-xl border border-[#00F2FF]/35 bg-[#0b1526] text-[#00F2FF] text-[14px] font-black tracking-wide hover:bg-[#12203a] transition-all text-center"
              >
                블로그 바로가기 →
              </a>
            </div>
          </div>
        </section>

        {/* PUBLIC PROJECTS / FIELD PILOTS */}
        <section id="public-projects" className="py-16 lg:py-28 bg-white/5">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
            <div className="text-center mb-10 lg:mb-14">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">
                공공 프로젝트 / 실증 사례
              </div>
              <h2 className="text-[28px] lg:text-[42px] font-black font-outfit mb-5">
                현장 적용 프로젝트 아카이브
              </h2>
              <p className="text-[#94A3B8] max-w-[860px] mx-auto text-[16px] lg:text-[18px]">
                현장 데이터와 운영 구조를 바탕으로 지역·공공 현장에 적용 가능한 프로젝트를 실증 형태로 정리하고 있습니다.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              <Link
                href="/tools/buan-vacant-report"
                className="glass-card group text-left block hover:border-[#00F2FF]/25"
              >
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#94A3B8] mb-4">
                  FIELD PILOT · BUAN
                </div>
                <h3 className="text-[22px] font-extrabold mb-3 font-outfit text-white group-hover:text-[#00F2FF] transition-colors leading-snug">
                  부안 빈집 활용 운영 프로젝트
                </h3>
                <p className="text-[#94A3B8] text-[14px] leading-relaxed font-medium max-w-[700px]">
                  농촌 빈집과 유휴시설을 대상으로 현장 점검, 운영 데이터 정리, 활용 가능성 검토를 연결하는 실증형 프로젝트입니다.
                </p>
                <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5">
                  <span className="text-[11px] font-bold text-[#64748B] tracking-wide">PUBLIC PILOT</span>
                  <span className="px-4 py-2 rounded-xl border border-[#00F2FF]/35 bg-[#0b1526] text-[#00F2FF] text-[12px] font-black tracking-wide hover:bg-[#12203a] transition-all">
                    프로젝트 보기
                  </span>
                </div>
              </Link>

              <div className="glass-card text-left border-white/10 bg-[#121C37]">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#94A3B8] mb-4">
                  FIELD PILOT · NEXT
                </div>
                <h3 className="text-[22px] font-extrabold mb-3 font-outfit text-white leading-snug">
                  추가 실증 프로젝트 준비 중
                </h3>
                <p className="text-[#94A3B8] text-[14px] leading-relaxed font-medium max-w-[700px]">
                  지역·공공 현장의 운영 데이터 구조를 바탕으로, 점검·정리·추적 흐름을 확장해나가고 있습니다.
                </p>
                <div className="mt-7 border-t border-white/10 pt-5 text-[12px] font-bold text-[#64748B]">
                  업데이트 예정
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT SECTION */}
        <section id="contact" className="py-16 lg:py-32">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
            <div className="text-center mb-12 lg:mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">Contact</div>
              <h2 className="text-[28px] lg:text-[42px] font-black font-outfit mb-6">Partner with OrbitAlpha</h2>
              <p className="text-[#94A3B8] max-w-[700px] mx-auto text-[16px] lg:text-[18px]">지금 바로 전문가와 실시간 리스크 관리 인프라를 상의하세요.</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-16">
              <div>
                <h3 className="text-[28px] font-bold mb-8 font-outfit">신속한 도입 프로세스</h3>
                <p className="text-[#94A3B8] mb-12 text-[18px]">OrbitAlpha는 기업의 환경에 맞춘 단계적 도입 솔루션을 제안합니다.</p>

                <div className="space-y-10">
                  <div className="flex gap-6 items-start">
                    <span className="text-[#00F2FF] text-[24px] font-black font-outfit leading-none">01</span>
                    <div>
                      <h4 className="text-[18px] font-bold text-white mb-2 font-outfit">2주 파일럿 (PoC)</h4>
                      <p className="text-[#94A3B8] text-[15px]">샘플 데이터를 활용한 SRS 대시보드 시범 운영</p>
                    </div>
                  </div>
                  <div className="flex gap-6 items-start">
                    <span className="text-[#00F2FF] text-[24px] font-black font-outfit leading-none">02</span>
                    <div>
                      <h4 className="text-[18px] font-bold text-white mb-2 font-outfit">API 인터페이스 협의</h4>
                      <p className="text-[#94A3B8] text-[15px]">기존 금융/HR 시스템과의 데이터 연동 옵션 검토</p>
                    </div>
                  </div>
                  <div className="flex gap-6 items-start">
                    <span className="text-[#00F2FF] text-[24px] font-black font-outfit leading-none">03</span>
                    <div>
                      <h4 className="text-[18px] font-bold text-white mb-2 font-outfit">솔루션 패키지 확정</h4>
                      <p className="text-[#94A3B8] text-[15px]">기업 맞춤형 ESG 리스크 매니지먼트 환경 구축</p>
                    </div>
                  </div>
                </div>
              </div>

              <ContactForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 lg:py-24 border-t border-white/5 bg-[#030509]">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 flex flex-col md:flex-row justify-between items-center gap-8 lg:gap-12 text-[#94A3B8]">
          <div className="text-center md:text-left">
            <div className="font-outfit font-black text-2xl lg:text-3xl mb-2 text-white italic tracking-tighter">OrbitAlpha</div>
            <div className="text-[12px] lg:text-[14px] opacity-70 font-bold font-inter">Powered by HSE&C Co., Ltd.</div>
          </div>
          <div className="flex flex-wrap justify-center gap-6 lg:gap-12 text-[11px] lg:text-[13px] font-black uppercase tracking-[0.25em] font-inter">
            <a href="#" className="hover:text-white transition-all">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-all">Terms of Service</a>
            <span className="opacity-40 font-bold">© 2026 OrbitAlpha Global</span>
          </div>
        </div>
      </footer>
    </div >
  );
}