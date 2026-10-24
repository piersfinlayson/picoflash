// Copyright (C) 2026 Piers Finlayson <piers@piers.rocks>
//
// MIT License

fetch('/html/site/footer.html')
    .then(response => response.text())
    .then(data => document.getElementById('footer').innerHTML = data);
