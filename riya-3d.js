import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
const host=document.getElementById("heroMascot"), canvas=document.getElementById("riya3dCanvas");
if(host&&canvas){
 try{
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(29,1,.1,100);camera.position.set(0,.35,8.8);
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  scene.add(new THREE.HemisphereLight(0xf3eaff,0x403052,2.15));
  const key=new THREE.DirectionalLight(0xfff5f2,2.7);key.position.set(-3,4,6);scene.add(key);
  const rim=new THREE.PointLight(0x9b78e8,15,12);rim.position.set(3,2,1);scene.add(rim);
  const fill=new THREE.PointLight(0x9bbcff,8,10);fill.position.set(-3,0,2);scene.add(fill);
  const bust=new THREE.Group();scene.add(bust);
  const material=(color,roughness=.48,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const skin=material(0xf1c9bd,.56), hair=material(0x382650,.36,.08), hairLight=material(0x7453a7,.38,.08);
  const pearl=material(0xe9e7f5,.3,.28), lavender=material(0x9276c9,.32,.25), dark=material(0x28223a,.3,.2);
  const white=material(0xffffff,.2), iris=material(0x7153ad,.22), pupil=material(0x171323,.16);
  const sphere=(parent,mat,pos,scale)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,48,36),mat);m.position.set(...pos);m.scale.set(...scale);parent.add(m);return m};
  // Soft shoulder silhouette and neck: a portrait bust, not a full robot body.
  sphere(bust,pearl,[0,-1.12,-.02],[1.18,.63,.48]);
  sphere(bust,lavender,[0,-1.22,.24],[.76,.34,.16]);
  sphere(bust,skin,[0,-.43,.02],[.28,.42,.26]);
  const head=new THREE.Group();head.position.set(0,.36,.02);bust.add(head);
  sphere(head,skin,[0,0,0],[.78,.98,.62]);
  // Rounded hair silhouette, bun and side locks.
  sphere(head,hair,[0,.55,-.08],[.82,.66,.65]);
  sphere(head,hair,[-.48,.83,-.12],[.36,.4,.36]);
  sphere(head,hairLight,[-.5,.94,-.1],[.27,.28,.28]);
  sphere(head,hair,[.03,1.05,-.14],[.4,.32,.35]);
  sphere(head,hairLight,[.26,.96,-.12],[.31,.25,.3]);
  sphere(head,hair,[-.72,-.04,-.02],[.19,.62,.23]);
  sphere(head,hair,[.72,-.04,-.02],[.18,.6,.22]);
  // Swept fringe with smooth curved locks.
  for(let k=0;k<4;k++){
   const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.62+k*.27,.48,.43),new THREE.Vector3(-.38+k*.27,.88,.52),new THREE.Vector3(-.12+k*.27,.62,.56));
   head.add(new THREE.Mesh(new THREE.TubeGeometry(curve,28,.065,10,false),k===2?hairLight:hair));
  }
  // Ears and softly styled headphones.
  for(const x of [-.76,.76]){
   sphere(head,skin,[x,-.02,.02],[.15,.23,.15]);
   sphere(head,dark,[x,.02,-.01],[.2,.31,.2]);
   sphere(head,lavender,[x,.02,.16],[.16,.25,.08]);
   sphere(head,pearl,[x,.02,.22],[.045,.07,.025]);
  }
  const band=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.78,.16,-.03),new THREE.Vector3(0,1.15,-.12),new THREE.Vector3(.78,.16,-.03));
  head.add(new THREE.Mesh(new THREE.TubeGeometry(band,48,.075,12,false),lavender));
  // Large expressive eyes with separate pupils for eye tracking.
  const pupils=[];
  for(const x of [-.29,.29]){
   sphere(head,white,[x,.07,.53],[.215,.27,.105]);
   sphere(head,pupil,[x,.065,.62],[.14,.19,.055]);
   const irisMesh=sphere(head,iris,[x,.06,.662],[.105,.145,.035]);pupils.push(irisMesh);
   sphere(head,white,[x-.035,.13,.69],[.043,.057,.018]);
   const brow=sphere(head,hair,[x,.39,.51],[.19,.045,.035]);brow.rotation.z=x<0?.1:-.1;
  }
  sphere(head,skin,[0,-.13,.59],[.055,.075,.05]);
  const smile=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.18,-.29,.55),new THREE.Vector3(0,-.41,.61),new THREE.Vector3(.18,-.29,.55));
  head.add(new THREE.Mesh(new THREE.TubeGeometry(smile,28,.02,8,false),hair));
  // Portrait lighting detail on the shoulder piece.
  sphere(bust,lavender,[-.77,-1.02,.16],[.16,.16,.12]);sphere(bust,lavender,[.77,-1.02,.16],[.16,.16,.12]);
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();host.classList.add("is-ready");
  const pointer={x:0,y:0};host.addEventListener("pointermove",e=>{const r=host.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width-.5)*2;pointer.y=((e.clientY-r.top)/r.height-.5)*2});
  let blink=0,nextBlink=2.2;
  function frame(ms){
   requestAnimationFrame(frame);const s=ms/1000;
   bust.position.y=-.05+Math.sin(s*1.1)*.035;
   head.rotation.y=THREE.MathUtils.lerp(head.rotation.y,pointer.x*.16+Math.sin(s*.45)*.025,.035);
   head.rotation.x=THREE.MathUtils.lerp(head.rotation.x,-pointer.y*.07+Math.sin(s*.7)*.012,.035);
   pupils.forEach(p=>{p.position.x=(p.position.x<0?-.29:.29)+pointer.x*.035;p.position.y=.06-pointer.y*.025});
   if(s>nextBlink){blink=1;nextBlink=s+2.4+Math.random()*2.4}
   if(blink>0){const scale=Math.max(.012,.19*(1-blink));head.children.filter((_,i)=>i===0).forEach(()=>{});blink-=.16}
   renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
 }catch(error){console.warn("Riya portrait renderer unavailable",error);host.classList.remove("is-ready")}
}