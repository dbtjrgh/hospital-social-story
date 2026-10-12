// 개발 중에만 쓰는 진행 이벤트 알림 ("4단계 연습 성공" 등).
// 태블릿↔PC 동기화 패널(src/devsync)이 'devsync:event' 를 받아 PC에 보여 줍니다.
// 납품 빌드에서는 import.meta.env.DEV 가 false 라서 이 코드가 통째로 빠집니다.
export function devEvent(message: string): void {
  if (import.meta.env.DEV) {
    window.dispatchEvent(new CustomEvent('devsync:event', { detail: message }));
  }
}
