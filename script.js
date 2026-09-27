const revealElements=document.querySelectorAll('.reveal');
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}})},{threshold:.12});revealElements.forEach(element=>observer.observe(element))}else{revealElements.forEach(element=>element.classList.add('visible'))}
const navToggle=document.querySelector('.nav-toggle');const navLinks=document.querySelector('.nav-links');
function closeNav(){if(!navToggle||!navLinks)return;navLinks.classList.remove('open');navToggle.setAttribute('aria-expanded','false');navToggle.setAttribute('aria-label','Open navigation')}
if(navToggle&&navLinks){navToggle.addEventListener('click',()=>{const open=navLinks.classList.toggle('open');navToggle.setAttribute('aria-expanded',String(open));navToggle.setAttribute('aria-label',open?'Close navigation':'Open navigation')});navLinks.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeNav));document.addEventListener('keydown',event=>{if(event.key==='Escape')closeNav()})}
const sections=[...document.querySelectorAll('section[id]')];const navAnchors=[...document.querySelectorAll('.nav-links a')];
if('IntersectionObserver' in window){const sectionObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){navAnchors.forEach(link=>{const active=link.getAttribute('href')===`#${entry.target.id}`;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')})}})},{rootMargin:'-35% 0px -55% 0px'});sections.forEach(section=>sectionObserver.observe(section))}
const yearTarget=document.querySelector('#year');if(yearTarget)yearTarget.textContent=new Date().getFullYear();


const codeRainCanvas=document.querySelector('#code-rain');
if(codeRainCanvas){
  const ctx=codeRainCanvas.getContext('2d');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const glyphs='01{}[]<>/=+*#$_;:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const fontSize=16;
  let columns=0;
  let drops=[];
  let animationFrame=null;
  let lastFrame=0;

  function resizeCodeRain(){
    const dpr=Math.min(window.devicePixelRatio||1,2);
    codeRainCanvas.width=Math.floor(window.innerWidth*dpr);
    codeRainCanvas.height=Math.floor(window.innerHeight*dpr);
    codeRainCanvas.style.width=window.innerWidth+'px';
    codeRainCanvas.style.height=window.innerHeight+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    columns=Math.ceil(window.innerWidth/fontSize);
    drops=Array.from({length:columns},(_,index)=>drops[index]??Math.random()*-80);
  }

  function drawCodeRain(timestamp){
    if(reducedMotion.matches){
      ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
      return;
    }
    if(timestamp-lastFrame<50){
      animationFrame=requestAnimationFrame(drawCodeRain);
      return;
    }
    lastFrame=timestamp;
    ctx.fillStyle='rgba(7,7,13,0.12)';
    ctx.fillRect(0,0,window.innerWidth,window.innerHeight);
    ctx.font='600 '+fontSize+'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textBaseline='top';

    for(let i=0;i<drops.length;i++){
      const char=glyphs[Math.floor(Math.random()*glyphs.length)];
      const x=i*fontSize;
      const y=drops[i]*fontSize;
      ctx.fillStyle=Math.random()>.9?'rgba(205,246,255,.9)':'rgba(64,223,255,.62)';
      ctx.fillText(char,x,y);
      if(y>window.innerHeight&&Math.random()>.975)drops[i]=Math.random()*-20;
      drops[i]+=0.72;
    }
    animationFrame=requestAnimationFrame(drawCodeRain);
  }

  function syncCodeRainMotion(){
    if(animationFrame)cancelAnimationFrame(animationFrame);
    animationFrame=null;
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    if(!reducedMotion.matches)animationFrame=requestAnimationFrame(drawCodeRain);
  }

  resizeCodeRain();
  syncCodeRainMotion();
  window.addEventListener('resize',resizeCodeRain,{passive:true});
  reducedMotion.addEventListener?.('change',syncCodeRainMotion);
}
