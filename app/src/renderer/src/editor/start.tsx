// 편집기 시작 (boot.tsx 가 Electron 앱 안에서만 따로 불러옴 → 웹 납품 빌드에는 이 아래 코드가 안 들어감)
import { setPhotoEdit } from '../lib/editHook';
import { startEditor } from './editorState';
import { restorePanelSizes } from './PanelResizer';
import { PhotoEdit } from './PhotoEdit';

export { EditorShell } from './EditorShell';

export function start(): void {
  startEditor();
  restorePanelSizes();
  setPhotoEdit((props) => <PhotoEdit {...props} />);
}
