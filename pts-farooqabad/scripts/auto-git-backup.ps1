$ErrorActionPreference = "Stop"

$ProjectPath = "D:\PTS Portal Wrok\Portal\pts-farooqabad"
$LogFile = Join-Path $ProjectPath "auto-git-backup.log"

function Write-BackupLog {
    param(
        [string]$Message
    )

    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Add-Content `
        -Path $LogFile `
        -Value "[$Timestamp] $Message"
}

try {
    Set-Location $ProjectPath

    git rev-parse --is-inside-work-tree *> $null

    if ($LASTEXITCODE -ne 0) {
        throw "Project is not a Git repository."
    }

    $Changes = git status --porcelain

    if (-not $Changes) {
        Write-BackupLog "No changes detected."
        exit 0
    }

    Write-BackupLog "Changes detected."

    git add -A

    if ($LASTEXITCODE -ne 0) {
        throw "git add failed."
    }

    git diff --cached --quiet

    if ($LASTEXITCODE -eq 0) {
        Write-BackupLog "No staged changes."
        exit 0
    }

    $CommitTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $CommitMessage = "Auto backup - $CommitTime"

    git commit -m $CommitMessage

    if ($LASTEXITCODE -ne 0) {
        throw "git commit failed."
    }

    Write-BackupLog "Commit created: $CommitMessage"

    git pull --rebase origin main

    if ($LASTEXITCODE -ne 0) {
        throw "git pull --rebase failed."
    }

    git push origin main

    if ($LASTEXITCODE -ne 0) {
        throw "git push failed."
    }

    Write-BackupLog "Successfully pushed to origin/main."
}
catch {
    Write-BackupLog "ERROR: $($_.Exception.Message)"
    exit 1
}