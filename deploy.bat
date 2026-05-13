@echo off
echo [1/2] Pushing to GitHub...
set /p repo_url="Enter your GitHub Repo URL: "
git remote add origin %repo_url%
git branch -M main
git push -u origin main

echo [2/2] Deploying to Vercel...
echo IMPORTANT: If prompted, link this to your Vercel project.
echo In Vercel Project Settings, ensure "Root Directory" is set to "web".
cd web
npx vercel --prod --confirm --yes
cd ..

echo Done! Hurcell Elite Tech is now live.
pause
