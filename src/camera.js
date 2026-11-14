// A follow camera that holds still while the target is inside a dead-zone box
// and moves only when the target reaches the box's edge.
export function followCamera(cam, target, view, world, zone = 0.22) {
  const hw = (view.w * zone) / 2, hh = (view.h * zone) / 2;
  let x = cam.x, y = cam.y;
  if (target.x > x + hw) x = target.x - hw;
  if (target.x < x - hw) x = target.x + hw;
  if (target.y > y + hh) y = target.y - hh;
  if (target.y < y - hh) y = target.y + hh;
  // Keep the view inside the world; centre it on an axis the view outgrows.
  const cx = view.w >= world.w ? world.w / 2 : Math.min(world.w - view.w / 2, Math.max(view.w / 2, x));
  const cy = view.h >= world.h ? world.h / 2 : Math.min(world.h - view.h / 2, Math.max(view.h / 2, y));
  return { x: cx, y: cy };
}
