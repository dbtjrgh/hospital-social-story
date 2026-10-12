// 예상 못 한 오류로 화면이 하얗게 멈추지 않게: 짧은 안내와 "첫 화면으로" 버튼만 보여 줌 (기록은 그대로 둠)
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app-frame crash" role="alert">
        <p className="crash__text">화면을 다시 열어야 해요.</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            window.location.hash = '#/';
            window.location.reload();
          }}
        >
          첫 화면으로
        </button>
      </div>
    );
  }
}
