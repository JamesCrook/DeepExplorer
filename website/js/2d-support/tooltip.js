export { hideTooltip, showTooltip };

/* The page's one tooltip element, driven by whichever harness has the
   pointer.  It lives here rather than in a model so that a build without
   the organiser still has somewhere for a hit to report itself. */

function showTooltip(ex,ey,info){
  const ttEl=document.getElementById('tooltip');
  ttEl.querySelector('.tt-name').textContent=info.name||'';
  ttEl.querySelector('.tt-detail').textContent=info.detail||'';
  ttEl.querySelector('.tt-extra').textContent=info.extra||'';
  ttEl.querySelector('.tt-name').style.color=info.selected?'#daa02e':'#e4dac6';
  ttEl.style.display='block';ttEl.style.left=(ex+14)+'px';ttEl.style.top=(ey-10)+'px';
}
function hideTooltip(){
  document.getElementById('tooltip').style.display='none';
}
