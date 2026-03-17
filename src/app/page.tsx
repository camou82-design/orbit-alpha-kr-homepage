"use client";

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
    const MAX_CONNECT_DIST = 48;

    scene = new THREE.Scene();

    // SCALE REFINED: Increased FOV and Z-position slightly to shrink the globe visual by ~10%
    camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 1000);
    camera.position.z = 350; // Increased from 320
    camera.position.y = 35;
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const loader = new THREE.TextureLoader();
    const earthGeo = new THREE.SphereGeometry(80, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      map: loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'),
      bumpMap: loader.load('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg'),
      bumpScale: 1.2,
      specular: new THREE.Color('#333'),
      shininess: 20
    });
    earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);

    const atmoGeo = new THREE.SphereGeometry(82, 64, 64);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x00F2FF,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide
    });
    const atmo = new THREE.Mesh(atmoGeo, atmoMat);
    scene.add(atmo);

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
    scene.add(swarmPoints);

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
    scene.add(satPoints);

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
    scene.add(constellationLines);

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

        .hero-card {
          background: rgba(13, 22, 45, 0.6);
          backdrop-filter: blur(32px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 32px;
<<<<<<< HEAD
          padding: 56px 64px; /* SCALE REFINED: Reduced padding by ~10% */
=======
          padding: 32px 24px;
          @media (min-width: 1024px) {
            padding: 56px 64px;
          }
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
          position: relative;
          overflow: hidden;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          box-shadow: 0 50px 120px -30px rgba(0, 0, 0, 0.7);
        }

        .dashboard-container {
          background: #020408;
          border-radius: 32px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          height: 100%;
          position: relative;
          overflow: hidden;
          box-shadow: 0 50px 120px -30px rgba(0, 0, 0, 0.7), 0 0 50px rgba(0, 242, 255, 0.05);
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
<<<<<<< HEAD
        <div className="max-w-[1440px] mx-auto px-10 flex items-center justify-between h-[100px]">
          <div className="flex items-center gap-6">
            <div className="font-outfit font-black text-[28px] tracking-tight flex items-center cursor-pointer" onClick={() => window.location.reload()}>
=======
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 flex items-center justify-between h-[70px] lg:h-[100px]">
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="font-outfit font-black text-[22px] lg:text-[28px] tracking-tight flex items-center cursor-pointer" onClick={() => window.location.reload()}>
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
              <span className="text-[#FFD700]">ORBIT</span>
              <span className="text-white/20 mx-2.5">/</span>
              <span className="text-[#00F2FF]">ALPHA</span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-14">
            {['OVERVIEW', 'RISK MODEL', 'PLATFORM', 'SOLUTIONS', 'CONTACT'].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="nav-link">{item}</a>
            ))}
          </nav>

<<<<<<< HEAD
          <div className="flex items-center gap-5">
            <a href="#contact" className="px-8 py-3.5 rounded-xl btn-cyber-outline font-outfit text-[13px] tracking-wide transition-all">
              PARTNERSHIP
            </a>
            <a href="#contact" className="px-8 py-3.5 rounded-xl btn-gold font-outfit text-[13px] tracking-wide transition-all shadow-xl">
=======
          <div className="flex items-center gap-3 lg:gap-5">
            <a href="#contact" className="px-4 lg:px-8 py-2.5 lg:py-3.5 rounded-xl btn-cyber-outline font-outfit text-[11px] lg:text-[13px] tracking-wide transition-all">
              PARTNERSHIP
            </a>
            <a href="#contact" className="px-4 lg:px-8 py-2.5 lg:py-3.5 rounded-xl btn-gold font-outfit text-[11px] lg:text-[13px] tracking-wide transition-all shadow-xl">
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
              REQUEST DEMO
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* HERO SECTION - SCALE REFINED */}
<<<<<<< HEAD
        <section id="overview" className="relative min-h-screen flex items-center pt-36 pb-28">
          <div className="max-w-[1440px] mx-auto px-10 w-full">
            {/* GRID HEIGHT REFINED: Reduced height from 660px to 600px (~10% reduction) */}
            <div className="grid lg:grid-cols-2 gap-16 items-stretch h-[600px]">

              {/* Left Column: Text Content Card */}
              <div className="hero-card">
                <div className="flex items-center gap-3.5 text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-10 font-outfit">
                  <span className="purse-dot" /> Real-time Risk Engine
                </div>

                {/* HEADING FONT REFINED: Reduced from text-[52px]/lg:text-[68px] to text-[46px]/lg:text-[60px] */}
                <h1 className="text-[46px] lg:text-[60px] font-black mb-10 leading-[1.1] font-outfit text-white">
                  산업 안전 데이터를 <br />
                  <span className="text-[#FFD700] drop-shadow-[0_0_25px_rgba(255,215,0,0.6)]">ESG 리스크 지표</span>로 <br />
                  전환합니다
                </h1>

                <p className="text-[18px] text-[#94A3B8] leading-[1.8] mb-12 max-w-[540px] font-medium">
                  <b>OrbitAlpha</b>는 산업 현장 운영 데이터를 실시간 분석하여 기업의 ESG 리스크를 정량화하는 고도화된 인텔리전스 인프라를 제공합니다.
                </p>

                <div className="flex flex-wrap gap-6 mb-12">
                  <a href="#contact" className="px-10 py-5 rounded-xl btn-gold text-[15px] transition-all">
                    데모 요청하기
                  </a>
                  <a href="#model" className="px-10 py-5 rounded-xl bg-[#121C37] border border-white/15 text-white text-[15px] font-black hover:bg-[#1a284e] transition-all">
=======
        <section id="overview" className="relative min-h-screen flex items-center pt-28 pb-16 lg:pt-36 lg:pb-28">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10 w-full">
            {/* GRID HEIGHT REFINED: Removed fixed height on mobile */}
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-stretch lg:h-[600px]">

              {/* Left Column: Text Content Card */}
              <div className="hero-card">
                <div className="flex items-center gap-3.5 text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-6 lg:mb-10 font-outfit">
                  <span className="purse-dot" /> Real-time Risk Engine
                </div>

                {/* HEADING FONT REFINED: Adjusted for mobile */}
                <h1 className="text-[32px] lg:text-[60px] font-black mb-6 lg:mb-10 leading-[1.1] font-outfit text-white break-keep" style={{ wordBreak: 'keep-all' }}>
                  산업 안전 데이터를 <br className="hidden lg:block" />
                  <span className="text-[#FFD700] drop-shadow-[0_0_25px_rgba(255,215,0,0.6)]">ESG 리스크 지표</span>로 <br className="hidden lg:block" />
                  전환합니다
                </h1>

                <p className="text-[16px] lg:text-[18px] text-[#94A3B8] leading-[1.8] mb-8 lg:mb-12 max-w-[540px] font-medium">
                  <b>OrbitAlpha</b>는 산업 현장 운영 데이터를 실시간 분석하여 기업의 ESG 리스크를 정량화하는 고도화된 인텔리전스 인프라를 제공합니다.
                </p>

                <div className="flex flex-wrap gap-4 lg:gap-6 mb-8 lg:mb-12">
                  <a href="#contact" className="flex-1 lg:flex-none px-6 lg:px-10 py-4 lg:py-5 rounded-xl btn-gold text-[14px] lg:text-[15px] transition-all text-center">
                    데모 요청하기
                  </a>
                  <a href="#model" className="flex-1 lg:flex-none px-6 lg:px-10 py-4 lg:py-5 rounded-xl bg-[#121C37] border border-white/15 text-white text-[14px] lg:text-[15px] font-black hover:bg-[#1a284e] transition-all text-center">
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
                    기술 백서 보기
                  </a>
                </div>

<<<<<<< HEAD
                <div className="flex gap-6">
=======
                <div className="flex flex-wrap gap-3 lg:gap-6">
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
                  <span className="tag-status">SRS Index 0-100</span>
                  <span className="tag-status">Shock & Recovery Logic</span>
                </div>
              </div>

              {/* Right Column: Globe Dashboard Card */}
<<<<<<< HEAD
              <div className="dashboard-container">
                <div ref={canvasRef} className="absolute inset-0" />

                <div className="relative z-10 p-10 flex flex-col h-full pointer-events-none">
                  <div className="flex justify-between items-start">
                    <div className="bg-black/65 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                      <span className="text-[10px] text-[#94A3B8] tracking-[0.3em] block mb-2 font-black uppercase">SRS · Risk Score</span>
                      <strong id="live-srs" className="text-5xl font-black text-[#FFD700] drop-shadow-[0_0_25px_rgba(255,215,0,0.6)] italic tracking-tighter">
                        82.4
                      </strong>
                    </div>
                    <div className="px-5 py-2.2 rounded-full bg-[#00F2FF]/20 border border-[#00F2FF]/50 text-[#00F2FF] text-[10px] font-black tracking-[0.25em] flex items-center gap-3 backdrop-blur-lg shadow-lg">
=======
              <div className="dashboard-container h-[400px] lg:h-full">
                <div ref={canvasRef} className="absolute inset-0" />

                <div className="relative z-10 p-6 lg:p-10 flex flex-col h-full pointer-events-none">
                  <div className="flex justify-between items-start">
                    <div className="bg-black/65 backdrop-blur-2xl p-4 lg:p-6 rounded-3xl border border-white/10 shadow-2xl">
                      <span className="text-[9px] lg:text-[10px] text-[#94A3B8] tracking-[0.3em] block mb-1 lg:mb-2 font-black uppercase">SRS · Risk Score</span>
                      <strong id="live-srs" className="text-3xl lg:text-5xl font-black text-[#FFD700] drop-shadow-[0_0_25px_rgba(255,215,0,0.6)] italic tracking-tighter">
                        82.4
                      </strong>
                    </div>
                    <div className="px-3 lg:px-5 py-1.5 lg:py-2.2 rounded-full bg-[#00F2FF]/20 border border-[#00F2FF]/50 text-[#00F2FF] text-[8px] lg:text-[10px] font-black tracking-[0.25em] flex items-center gap-2 lg:gap-3 backdrop-blur-lg shadow-lg">
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
                      <span className="pulse-dot" /> ORBITAL LIVE
                    </div>
                  </div>

<<<<<<< HEAD
                  <div className="mt-auto flex gap-5 pb-4 text-center">
                    <div className="flex-1 p-6 rounded-3xl bg-black/80 backdrop-blur-2xl border border-white/15 shadow-2xl">
                      <span className="text-[10px] text-[#94A3B8] block mb-2 uppercase font-black tracking-[0.2em]">Total Satellites</span>
                      <div id="total-sat-val" className="text-xl font-black text-[#00F2FF] tracking-tight">15,000</div>
                    </div>
                    <div className="flex-1 p-6 rounded-3xl bg-black/80 backdrop-blur-2xl border border-white/15 shadow-2xl border-l-[#FFD700]/40 pl-8">
                      <span className="text-[10px] text-[#FFD700] block mb-2 uppercase font-black tracking-[0.2em]">Starlink Links</span>
                      <div id="active-links-val" className="text-xl font-black text-[#FFD700] tracking-tight">4,281</div>
=======
                  <div className="mt-auto flex flex-col sm:flex-row gap-4 lg:gap-5 pb-4 text-center">
                    <div className="flex-1 p-4 lg:p-6 rounded-3xl bg-black/80 backdrop-blur-2xl border border-white/15 shadow-2xl">
                      <span className="text-[9px] lg:text-[10px] text-[#94A3B8] block mb-1 lg:mb-2 uppercase font-black tracking-[0.2em]">Total Satellites</span>
                      <div id="total-sat-val" className="text-lg lg:text-xl font-black text-[#00F2FF] tracking-tight">15,000</div>
                    </div>
                    <div className="flex-1 p-4 lg:p-6 rounded-3xl bg-black/80 backdrop-blur-2xl border border-white/15 shadow-2xl border-l-[#FFD700]/40 pl-6 lg:pl-8">
                      <span className="text-[9px] lg:text-[10px] text-[#FFD700] block mb-1 lg:mb-2 uppercase font-black tracking-[0.2em]">Starlink Links</span>
                      <div id="active-links-val" className="text-lg lg:text-xl font-black text-[#FFD700] tracking-tight">4,281</div>
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* SOLUTIONS SECTION */}
<<<<<<< HEAD
        <section id="solutions" className="py-32">
          <div className="max-w-[1440px] mx-auto px-10">
            <div className="text-center mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">Solutions</div>
              <h2 className="text-[42px] font-black font-outfit mb-6">Shift to Dynamic Intelligence</h2>
              <p className="text-[#94A3B8] max-w-[700px] mx-auto text-[18px]">정적 보고 중심의 기존 ESG를 넘어서, 운영 리스크를 즉각적으로 반영하는 실시간 인텔리전스로 전환합니다.</p>
=======
        <section id="solutions" className="py-16 lg:py-32">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
            <div className="text-center mb-12 lg:mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">Solutions</div>
              <h2 className="text-[28px] lg:text-[42px] font-black font-outfit mb-6">Shift to Dynamic Intelligence</h2>
              <p className="text-[#94A3B8] max-w-[700px] mx-auto text-[16px] lg:text-[18px]">정체된 세상을 바꾸는 실시간 산업 안전 리스크 엔진.</p>
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="glass-card">
                <div className="text-[#FFD700] font-black mb-6 uppercase tracking-widest">[ Problem ]</div>
                <h3 className="text-[24px] font-bold mb-6 font-outfit">정체된 ESG 평가 시스템</h3>
                <p className="text-[#94A3B8] leading-8 text-[16px]">
                  • 연 1회 보고 중심의 사후 처리<br />
                  • 사실 확인이 어려운 설문 기반 데이터<br />
                  • 돌발 사고의 영향력이 즉각 반영되지 않음
                </p>
              </div>
              <div className="glass-card shadow-[0_0_50px_rgba(0,242,255,0.05)] border-[#00F2FF]/20">
                <div className="text-[#00F2FF] font-black mb-6 uppercase tracking-widest">[ Solution ]</div>
                <h3 className="text-[24px] font-bold mb-6 font-outfit">OrbitAlpha Dynamic Scoring</h3>
                <p className="text-[#94A3B8] leading-8 text-[16px]">
                  • 산업 현장 신호를 기반으로 실시간 SRS 산출<br />
                  • 사고 충격(Shock)과 개선 회복(Recovery)의 정량화<br />
                  • 금융 및 공급망 의사결정에 즉시 활용 가능
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* RISK MODEL SECTION */}
<<<<<<< HEAD
        <section id="model" className="py-32 bg-white/5">
          <div className="max-w-[1440px] mx-auto px-10">
            <div className="text-center mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">The Model</div>
              <h2 className="text-[42px] font-black font-outfit mb-6">핵심 기술 지표</h2>
              <p className="text-[#94A3B8] max-w-[700px] mx-auto text-[18px]">OrbitAlpha는 독자적인 알고리즘을 통해 리스크를 세밀하게 측정합니다.</p>
=======
        <section id="model" className="py-16 lg:py-32 bg-white/5">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
            <div className="text-center mb-12 lg:mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">The Model</div>
              <h2 className="text-[28px] lg:text-[42px] font-black font-outfit mb-6">핵심 기술 지표</h2>
              <p className="text-[#94A3B8] max-w-[700px] mx-auto text-[16px] lg:text-[18px]">실시간 알고리즘을 통한 정교한 리스크 측정 인프라.</p>
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
            </div>

            <div className="grid lg:grid-cols-4 gap-6">
              <div
                className="glass-card flex flex-col items-center text-center py-12 px-8 cursor-pointer group"
                onClick={() => router.push('/entry')}
              >
                <h3 className="text-[22px] font-extrabold mb-8 font-outfit text-[#00F2FF] tracking-tight group-hover:text-[#FFD700] transition-colors">JJ형틀해체정리</h3>
                <div className="flex flex-col space-y-4 mb-10 text-[#CBD5E1] text-[15px] leading-relaxed font-medium">
                  <p>형틀 해체 및 정리 작업 지원</p>
                  <p>현장 인력 투입 및 작업 보조</p>
                  <p>자재 이동·반출·적치 정리</p>
                  <p>작업 마감 정리 및 신속 대응</p>
                </div>
                <div className="mt-auto pt-6 border-t border-white/10 w-full flex flex-col items-center">
                  <div className="text-[14px] font-bold text-white tracking-wide">
                    문의 <span className="text-[#FFD700] ml-1">010-9573-2510</span>
                  </div>
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

            <div className="grid md:grid-cols-3 gap-8 mt-16">
              <div className="step-box">
                <span className="step-num">01</span>
                <h3 className="text-[20px] font-bold mb-4 font-outfit">Data Ingestion</h3>
                <p className="text-[#94A3B8] text-[15px] leading-relaxed">사고 기록, 점검 데이터, 교육 이행률 등 현장 실시간 데이터를 수집합니다.</p>
              </div>
              <div className="step-box border-[#00F2FF]/30">
                <span className="step-num">02</span>
                <h3 className="text-[20px] font-bold mb-4 font-outfit text-[#00F2FF]">Quantification</h3>
                <p className="text-[#94A3B8] text-[15px] leading-relaxed">수집된 데이터를 OrbitAlpha 리스크 엔진을 거쳐 SRS 점수로 변환합니다.</p>
              </div>
              <div className="step-box">
                <span className="step-num">03</span>
                <h3 className="text-[20px] font-bold mb-4 font-outfit">Intelligence</h3>
                <p className="text-[#94A3B8] text-[15px] leading-relaxed">점수화된 데이터를 보험 요율 산정, 투자 필터링, 대시보드로 시각화합니다.</p>
              </div>
            </div>
          </div>
        </section>

        {/* PLATFORM SECTION */}
        <section id="platform" className="py-20 flex justify-center">
          <div className="flex gap-4">
            <div className="w-[80px] h-[2px] bg-[#00F2FF]/20 mt-4"></div>
            <div className="text-center font-outfit font-black text-white/10 text-6xl tracking-widest">INFRASTRUCTURE</div>
            <div className="w-[80px] h-[2px] bg-[#00F2FF]/20 mt-4"></div>
          </div>
        </section>

        {/* CONTACT SECTION */}
<<<<<<< HEAD
        <section id="contact" className="py-32">
          <div className="max-w-[1440px] mx-auto px-10">
            <div className="text-center mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">Contact</div>
              <h2 className="text-[42px] font-black font-outfit mb-6">Partner with OrbitAlpha</h2>
              <p className="text-[#94A3B8] max-w-[700px] mx-auto text-[18px]">미래형 산업 리스크 인프라를 선점하세요. 지금 바로 전문가와 상담하세요.</p>
=======
        <section id="contact" className="py-16 lg:py-32">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
            <div className="text-center mb-12 lg:mb-20">
              <div className="text-[#00F2FF] text-[12px] font-black tracking-[0.3em] uppercase mb-4 font-outfit">Contact</div>
              <h2 className="text-[28px] lg:text-[42px] font-black font-outfit mb-6">Partner with OrbitAlpha</h2>
              <p className="text-[#94A3B8] max-w-[700px] mx-auto text-[16px] lg:text-[18px]">지금 바로 전문가와 실시간 리스크 관리 인프라를 상의하세요.</p>
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
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

<<<<<<< HEAD
              <div className="bg-white/5 border border-white/10 rounded-[32px] p-10 backdrop-blur-3xl shadow-2xl">
                <form className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
=======
              <div className="bg-white/5 border border-white/10 rounded-[32px] p-6 lg:p-10 backdrop-blur-3xl shadow-2xl">
                <form className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
                    <div>
                      <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">회사명</label>
                      <input type="text" placeholder="예: HSE&C" className="w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 focus:border-[#00F2FF]/50 transition-all outline-none" />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">성함/담당자</label>
                      <input type="text" placeholder="홍길동 팀장" className="w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 focus:border-[#00F2FF]/50 transition-all outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">이메일</label>
                    <input type="email" placeholder="contact@company.com" className="w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 focus:border-[#00F2FF]/50 transition-all outline-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">관심 분야</label>
                    <select className="w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 focus:border-[#00F2FF]/50 transition-all outline-none appearance-none cursor-pointer">
                      <option>Supply Chain ESG</option>
                      <option>Insurance Risk Pricing</option>
                      <option>Investment Screening</option>
                      <option>Strategic Partnership</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest mb-3 block">문의 메세지</label>
                    <textarea rows={4} placeholder="문의하실 내용을 입력해주세요." className="w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 focus:border-[#00F2FF]/50 transition-all outline-none resize-none"></textarea>
                  </div>
                  <button type="submit" className="w-full py-5 rounded-2xl btn-gold text-[16px] font-black tracking-widest uppercase transition-all">문의 보내기</button>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

<<<<<<< HEAD
      <footer className="py-24 border-t border-white/5 bg-[#030509]">
        <div className="max-w-[1440px] mx-auto px-10 flex flex-col md:flex-row justify-between items-center gap-12 text-[#94A3B8]">
          <div className="text-center md:text-left">
            <div className="font-outfit font-black text-3xl mb-2 text-white italic tracking-tighter">OrbitAlpha</div>
            <div className="text-[14px] opacity-70 font-bold font-inter">Powered by HSE&C Co., Ltd.</div>
          </div>
          <div className="flex gap-12 text-[13px] font-black uppercase tracking-[0.25em] font-inter">
=======
      <footer className="py-12 lg:py-24 border-t border-white/5 bg-[#030509]">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 flex flex-col md:flex-row justify-between items-center gap-8 lg:gap-12 text-[#94A3B8]">
          <div className="text-center md:text-left">
            <div className="font-outfit font-black text-2xl lg:text-3xl mb-2 text-white italic tracking-tighter">OrbitAlpha</div>
            <div className="text-[12px] lg:text-[14px] opacity-70 font-bold font-inter">Powered by HSE&C Co., Ltd.</div>
          </div>
          <div className="flex flex-wrap justify-center gap-6 lg:gap-12 text-[11px] lg:text-[13px] font-black uppercase tracking-[0.25em] font-inter">
>>>>>>> 3203d7be (feat: stabilize mobile responsive layout and fix contact form)
            <a href="#" className="hover:text-white transition-all">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-all">Terms of Service</a>
            <span className="opacity-40 font-bold">© 2026 OrbitAlpha Global</span>
          </div>
        </div>
      </footer>
    </div>
  );
}