(() => {
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  let registration,requestedUpdate=false;
  function showUpdate(reg) {
    if(!reg.waiting)return;
    const banner=document.getElementById('updateBanner');if(banner)banner.hidden=false;
  }
  window.addEventListener('load',async()=>{
    try {
      registration=await navigator.serviceWorker.register('/service-worker.js',{scope:'/',updateViaCache:'none'});
      showUpdate(registration);
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate(registration);});
      });
      document.getElementById('applyUpdate')?.addEventListener('click',()=>{
        if(!registration.waiting)return;
        requestedUpdate=true; registration.waiting.postMessage({type:'SKIP_WAITING'});
      });
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requestedUpdate)location.reload();});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)registration.update().catch(()=>{});});
    }catch(error){console.warn('Az offline mód nem indult el:',error.name);}
  },{once:true});
})();
