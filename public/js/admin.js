// Admin Dashboard & Form Client-side Logic
document.addEventListener('DOMContentLoaded', () => {
  // Live Gross Weight & Tax Calculator
  const netWeightInput = document.getElementById('netWeight');
  const tareWeightInput = document.getElementById('tareWeight');
  const rateInput = document.getElementById('ratePerMT');
  const taxPctInput = document.getElementById('royaltyTaxPercent');

  const grossWeightDisplay = document.getElementById('grossWeightDisplay');
  const totalAmountDisplay = document.getElementById('totalAmountDisplay');

  function calculateAll() {
    const net = parseFloat(netWeightInput?.value) || 0;
    const tare = parseFloat(tareWeightInput?.value) || 0;
    const rate = parseFloat(rateInput?.value) || 0;
    const taxPct = parseFloat(taxPctInput?.value) || 0;

    const gross = (net + tare).toFixed(2);
    const baseVal = net * rate;
    const taxAmt = baseVal * (taxPct / 100);
    const total = baseVal + taxAmt;

    if (grossWeightDisplay) grossWeightDisplay.innerText = gross + ' MT';
    if (totalAmountDisplay) totalAmountDisplay.innerText = '₹ ' + total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (netWeightInput) {
    netWeightInput.addEventListener('input', calculateAll);
    tareWeightInput.addEventListener('input', calculateAll);
    rateInput.addEventListener('input', calculateAll);
    taxPctInput.addEventListener('input', calculateAll);
    calculateAll();
  }

  // File Upload Preview Handlers
  function setupImagePreview(fileInputId, previewImgId, placeholderId) {
    const fileInput = document.getElementById(fileInputId);
    const previewImg = document.getElementById(previewImgId);
    const placeholder = document.getElementById(placeholderId);

    if (fileInput && previewImg) {
      fileInput.addEventListener('change', function () {
        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {
            previewImg.src = e.target.result;
            previewImg.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
          };
          reader.readAsDataURL(file);
        }
      });
    }
  }

  setupImagePreview('frontImageFile', 'frontPreviewImg', 'frontPlaceholder');
  setupImagePreview('sideImageFile', 'sidePreviewImg', 'sidePlaceholder');
});
