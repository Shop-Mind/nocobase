// 创意工坊独立菜单页 jsBlock(薄壳):解析 URL ?productId=&assetIds=&from=,把插件内的创意工坊组件挂进容器。
// 组件与全部交互都在插件 bundle 里(window.__aiListingWorkshopKit,由 client/plugin.tsx 安装);
// 本 jsBlock 保持最薄 —— 以后功能迭代只改插件源码(yarn build + 刷新),不再写库。
// 镜像同步:改本文件后运行 docs/plans/scripts/create-workshop-page.js(幂等:建页一次,之后只同步代码)。
// 沙箱约定:hooks 不是裸全局,必须从 ctx.libs.React 解构;SES 沙箱没有 URLSearchParams 构造器,
// 查询串一律手写正则解析(与 preview-edit 镜像同一类坑)。
const React = ctx.libs.React;
const { useEffect, useRef } = React;

// 手写取参:SES 沙箱无 URLSearchParams
function getParam(name) {
  const m = (window.location.search || '').match(new RegExp('[?&]' + name + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function WorkshopPage() {
  const ref = useRef(null);
  const ready = typeof window !== 'undefined' && !!window.__aiListingWorkshopKit;
  useEffect(() => {
    if (!ready || !ref.current) return undefined;
    const productId = Number(getParam('productId')) || undefined;
    const assetIds = (getParam('assetIds') || '')
      .split(',')
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
    const fromReview = getParam('from') === 'review';
    const unmount = window.__aiListingWorkshopKit.mount(ref.current, {
      productId,
      assetIds,
      allowSwitch: true,
      // 从预览编辑跳来的才给「返回候选区」;菜单直接进的没有来路,不显示返回
      onBack: fromReview
        ? () => {
            window.history.back();
          }
        : undefined,
      onProductChange: (id) => {
        // 切商品同步 URL(只保留 productId):刷新/分享链接仍指向该商品
        window.history.replaceState(null, '', window.location.pathname + '?productId=' + id);
      },
    });
    return () => {
      try {
        if (unmount) unmount();
      } catch (e) {}
    };
  }, [ready]);
  return ready ? (
    <div ref={ref} />
  ) : (
    <div style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>创意工坊未就绪(请刷新页面或联系管理员)</div>
  );
}
ctx.render(<WorkshopPage />);
