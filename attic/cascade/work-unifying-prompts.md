```json
{ "role": "PROMPT"}
```
---

Parmas Unification 
- local-params-stnda.html
- procedural-params-stnda.html
- overlayer-params-stnda.html
- html-param-morphing.html

We already have animated morphing to presets for canvas (redraws everything using draw2d) and 3d (uses update() sent to THREE.js). Updated values arrive in the params structure. Html needs it too, and the challenge there is that many examples come wired with dom events, going direct rather than iterating over a scene graph. We in fact don't expect to iterate over a scene graph. We expect to update css --var parameters. 

Proposed solution is to add a wire() method for html targets, and wire sets up look up and watchers on the params. 

The presets animation system changes   