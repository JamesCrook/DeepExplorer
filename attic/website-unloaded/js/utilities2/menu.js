import "../2d-support/vector2d.js"
import "../2d-support/box.js"
import "./help.js"
import "./nav.js"

// initMenu — adds items to window.NavMenu

function initMenu( menuItems ){
	window.NavMenu.addItems( menuItems );
}

const Vector2D = window.Vector2D

export { initMenu }
export { Vector2D }