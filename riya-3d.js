import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const host=document.getElementById("heroMascot");
const canvas=document.getElementById("riya3dCanvas");
if(host&&canvas){
 try{
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(32,1,.1,100);
  camera.position.set(0,1.05,7.7);
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  scene.add(new THREE.HemisphereLight(0xe8ddff,0x31244c,2.0));
  const key=new THREE.DirectionalLight(0xffffff,3.0);key.position.set(-3,5,6);scene.add(key);
  const rim=new THREE.PointLight(0x9d76ff,26,12);rim.position.set(3,2,2);scene.add(rim);
  const fill=new THREE.PointLight(0x8db9ff,15,10);fill.position.set(-3,1,1);scene.add(fill);
  const robot=new THREE.Group();scene.add(robot);
  const mat=(color,metalness=0,roughness=.42)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const pearl=mat(0xe8e8f8,.55,.25), lavender=mat(0x9272d5,.5,.28), deep=mat(0x25203c,.35,.3), skin=mat(0xf2c7c0,.05,.4), hair=mat(0x30204f,.35,.28), hairHi=mat(0x7551b9,.4,.25), white=mat(0xffffff,.05,.2), iris=mat(0x6546b8,.2,.2), black=mat(0x171329,.05,.16);
  const sphere=(parent,material,pos,scale)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material);m.position.set(...pos);m.scale.set(...scale);parent.add(m);return m};
  const capsule=(parent,material,pos,scale)=>{const m=new THREE.Mesh(new THREE.CapsuleGeometry(.5,1,8,16),material);m.position.set(...pos);m.scale.set(...scale);parent.add(m);return m};
  const rounded=(parent,material,pos,scale,r=.16)=>{const shape=new THREE.Shape();const w=scale[0],h=scale[1];shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const geo=new THREE.ExtrudeGeometry(shape,{depth:scale[2],bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.06,bevelThickness:.05});const m=new THREE.Mesh(geo,material);m.position.set(...pos);parent.add(m);return m};
  // torso and shoulders
  capsule(robot,deep,[0,-1.05,0],[.66,.88,.43]);
  rounded(robot,pearl,[0,-1.12,.18],[1.38,1.02,.28],.25);
  rounded(robot,lavender,[0,-.88,.34],[.72,.36,.1],.14);
  sphere(robot,lavender,[-.78,-.78,0],[.34,.34,.34]);sphere(robot,pearl,[-.78,-.78,.18],[.28,.29,.2]);
  sphere(robot,lavender,[.78,-.78,0],[.34,.34,.34]);sphere(robot,pearl,[.78,-.78,.18],[.28,.29,.2]);
  // neck and head group
  capsule(robot,deep,[0,-.25,0],[.24,.38,.23]);
  const head=new THREE.Group();head.position.set(0,.62,.04);robot.add(head);
  sphere(head,skin,[0,0,0],[.76,.88,.59]);
  // hair cap, bun, side locks
  sphere(head,hair,[0,.48,-.06],[.79,.62,.62]);
  sphere(head,hairHi,[-.42,.77,-.1],[.36,.37,.35]);
  sphere(head,hair,[-.48,.9,-.12],[.29,.29,.3]);
  sphere(head,hair,[.02,1.02,-.14],[.39,.3,.34]);
  sphere(head,hairHi,[.23,.94,-.1],[.34,.25,.32]);
  capsule(head,hair,[-.69,-.05,-.04],[.18,.62,.2]);
  capsule(head,hair,[.68,-.04,-.02],[.17,.6,.2]);
  // fringe curves
  for(let k=0;k<3;k++){const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.58+k*.3,.55,.39),new THREE.Vector3(-.34+k*.3,.92,.5),new THREE.Vector3(-.08+k*.3,.64,.52));const strand=new THREE.Mesh(new THREE.TubeGeometry(curve,24,.055,8,false),k===1?hairHi:hair);head.add(strand)}
  // eyes, irises, highlights, brows
  const eyes=[];
  for(const x of [-.29,.29]){
   sphere(head,white,[x,.08,.51],[.205,.27,.11]);
   const eye=sphere(head,black,[x,.065,.607],[.145,.205,.055]);eyes.push(eye);
   sphere(head,iris,[x+.015,.055,.65],[.105,.15,.04]);
   sphere(head,white,[x-.035,.13,.684],[.045,.06,.018]);
   const brow=sphere(head,hair,[x,.39,.49],[.19,.045,.035]);brow.rotation.z=x<0?.12:-.12;
  }
  // small nose and smile
  sphere(head,skin,[0,-.13,.57],[.055,.075,.05]);
  const smileCurve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.17,-.28,.53),new THREE.Vector3(0,-.4,.59),new THREE.Vector3(.17,-.28,.53));
  head.add(new THREE.Mesh(new THREE.TubeGeometry(smileCurve,24,.018,8,false),hair));
  // headphones
  const bandCurve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.77,.13,.02),new THREE.Vector3(0,1.05,-.02),new THREE.Vector3(.77,.13,.02));
  head.add(new THREE.Mesh(new THREE.TubeGeometry(bandCurve,40,.075,12,false),lavender));
  for(const x of [-.76,.76]){sphere(head,deep,[x,.04,.02],[.2,.29,.19]);sphere(head,lavender,[x,.04,.17],[.17,.25,.08]);sphere(head,white,[x,.04,.23],[.045,.08,.025])}
  // articulated arms with pivot joints
  const leftArm=new THREE.Group();leftArm.position.set(-.84,-.65,0);robot.add(leftArm);
  capsule(leftArm,pearl,[-.1,-.4,.02],[.19,.55,.2]);sphere(leftArm,lavender,[-.1,-.08,.02],[.23,.22,.22]);sphere(leftArm,pearl,[-.15,-.78,.08],[.21,.18,.2]);
  const rightArm=new THREE.Group();rightArm.position.set(.84,-.65,0);robot.add(rightArm);
  capsule(rightArm,pearl,[.12,-.36,.03],[.19,.53,.2]);sphere(rightArm,lavender,[.12,-.06,.02],[.23,.22,.22]);sphere(rightArm,pearl,[.18,-.72,.1],[.21,.18,.2]);
  // forearm hand details
  sphere(leftArm,white,[-.16,-.83,.22],[.13,.12,.12]);sphere(rightArm,white,[.2,-.78,.23],[.13,.12,.12]);
  robot.scale.setScalar(.96);robot.position.y=-.12;
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};
  const ro=new ResizeObserver(resize);ro.observe(host);resize();host.classList.add("is-ready");
  let t=0,waveUntil=0,blinkAt=2.5,blink=0;
  host.addEventListener("pointerenter",()=>{waveUntil=performance.now()+1500});
  host.addEventListener("click",()=>{waveUntil=performance.now()+2100});
  function frame(now){
   requestAnimationFrame(frame);const sec=now/1000;t+=.016;
   robot.position.y=-.12+Math.sin(sec*1.15)*.055;
   robot.rotation.y=Math.sin(sec*.55)*.12;
   robot.rotation.z=Math.sin(sec*.8)*.018;
   head.rotation.y=Math.sin(sec*.8)*.09;
   head.rotation.x=Math.sin(sec*.7)*.025;
   const waving=now<waveUntil;
   rightArm.rotation.z=waving?-.95+Math.sin(sec*10)*.2:Math.sin(sec*.7)*.035;
   rightArm.rotation.x=waving?-.35:0;
   if(sec>blinkAt){blink=.001;blinkAt=sec+2.4+Math.random()*2.8}
   if(blink){eyes.forEach(e=>e.scale.y=Math.max(.012,.205*(1-Math.sin(Math.min(1,blink)*Math.PI))));blink+=.12;if(blink>1)blink=0}
   renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
 }catch(err){console.warn("Riya 3D character could not initialize",err);host.classList.remove("is-ready")}
}
